import type {AuthFile, AuthFileModelInfo, AuthFileModelsResponse, AuthFilesResponse, CodexAccountUsage, UsageStats} from '../models.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;

export class ManagementApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ManagementApiError';
  }
}

export class ManagementApiClient {
  baseUrl: string;
  private readonly fallbackBaseUrls: string[];

  constructor(
    inputUrl: string,
    private readonly managementKey: string,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
    private readonly retries = DEFAULT_RETRIES,
  ) {
    const candidates = normalizeManagementBaseUrls(inputUrl);
    this.baseUrl = candidates[0];
    this.fallbackBaseUrls = candidates.slice(1);
  }

  async fetchUsage(): Promise<UsageStats> {
    return this.requestJson<UsageStats>('/usage');
  }

  async fetchAuthFiles(): Promise<AuthFile[]> {
    const response = await this.requestJson<AuthFilesResponse>('/auth-files');
    return response.files ?? [];
  }

  async fetchModels(name: string): Promise<AuthFileModelInfo[]> {
    const query = new URLSearchParams({name});
    const response = await this.requestJson<AuthFileModelsResponse>(`/auth-files/models?${query.toString()}`);
    return response.models ?? [];
  }

  async fetchModelsByNames(names: string[]): Promise<Record<string, AuthFileModelInfo[]>> {
    const entries = await Promise.all(
      names.map(async (name) => [name, await this.fetchModels(name)] as const),
    );

    return Object.fromEntries(entries);
  }

  async fetchCodexUsage(auth: AuthFile): Promise<CodexAccountUsage | undefined> {
    if (auth.provider !== 'codex' || !auth.auth_index) {
      return undefined;
    }

    const accountId = auth.id_token?.chatgpt_account_id;
    const response = await this.requestJson<APICallResponse>('/api-call', {
      method: 'POST',
      body: {
        auth_index: auth.auth_index,
        method: 'GET',
        url: 'https://chatgpt.com/backend-api/wham/usage',
        header: {
          Authorization: 'Bearer $TOKEN$',
          Accept: 'application/json',
          ...(accountId ? {'ChatGPT-Account-Id': accountId} : {}),
        },
      },
    });

    if (response.status_code < 200 || response.status_code >= 300) {
      return undefined;
    }

    return parseCodexUsageResponse(response.body, auth);
  }

  async fetchCodexUsageByAuthFiles(authFiles: AuthFile[]): Promise<Record<string, CodexAccountUsage>> {
    const codexFiles = authFiles.filter((file) => file.provider === 'codex' && file.auth_index && !file.disabled);
    const entries = await Promise.all(
      codexFiles.map(async (file) => {
        try {
          const quota = await this.fetchCodexUsage(file);
          return quota && file.auth_index ? [file.auth_index, quota] as const : undefined;
        } catch {
          return undefined;
        }
      }),
    );

    return Object.fromEntries(entries.filter(Boolean).map((entry) => entry as readonly [string, CodexAccountUsage]));
  }

  private async requestJson<T>(path: string, init?: {method?: string; body?: unknown}): Promise<T> {
    const baseUrls = [this.baseUrl, ...this.fallbackBaseUrls];
    let lastError: unknown;

    for (const baseUrl of baseUrls) {
      let attempt = 0;

      while (attempt <= this.retries) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
          const response = await fetch(`${baseUrl}${path}`, {
            method: init?.method ?? 'GET',
            headers: {
              Authorization: `Bearer ${this.managementKey}`,
              'Content-Type': 'application/json',
            },
            body: init?.body ? JSON.stringify(init.body) : undefined,
            signal: controller.signal,
          });

          if (!response.ok) {
            throw await createHttpError(response);
          }

          this.baseUrl = baseUrl;
          return (await response.json()) as T;
        } catch (error) {
          lastError = error;
          const fallbackAllowed = error instanceof ManagementApiError && error.status === 404;
          const retryable = isRetryableError(error);

          if (fallbackAllowed) {
            break;
          }

          if (!retryable || attempt === this.retries) {
            throw toManagementApiError(error);
          }

          await sleep(400 * (attempt + 1));
        } finally {
          clearTimeout(timeout);
        }

        attempt += 1;
      }
    }

    throw toManagementApiError(lastError);
  }
}

export function normalizeManagementBaseUrls(inputUrl: string): string[] {
  const trimmed = inputUrl.trim();
  const normalized = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  const candidates: string[] = [];

  if (/\/v0\/management$/i.test(normalized)) {
    return [normalized];
  }

  candidates.push(`${normalized}/v0/management`);

  if (/\/CPA$/i.test(normalized)) {
    candidates.push(`${normalized.slice(0, -4)}/v0/management`);
  }

  return [...new Set(candidates)];
}

async function createHttpError(response: Response): Promise<ManagementApiError> {
  const body = (await response.text()).trim();

  if (response.status === 401) {
    return new ManagementApiError('鉴权失败：Management API key 不正确。', response.status);
  }

  if (response.status === 403) {
    return new ManagementApiError('访问被拒绝：请确认远程管理已开启，并允许当前地址访问。', response.status);
  }

  if (response.status === 404) {
    return new ManagementApiError('未找到 Management API：请确认地址是否正确，或实例是否暴露 /v0/management。', response.status);
  }

  return new ManagementApiError(
    body ? `请求失败（${response.status}）：${body}` : `请求失败（${response.status}）。`,
    response.status,
  );
}

function toManagementApiError(error: unknown): ManagementApiError {
  if (error instanceof ManagementApiError) {
    return error;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return new ManagementApiError('请求超时：目标 CPA 没有在预期时间内响应。');
  }

  if (error instanceof Error) {
    return new ManagementApiError(`连接失败：${error.message}`);
  }

  return new ManagementApiError('连接失败：出现未知错误。');
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof ManagementApiError) {
    return error.status !== undefined && error.status >= 500;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }

  return true;
}

type APICallResponse = {
  status_code: number;
  header?: Record<string, string[]>;
  body?: string;
};

function parseCodexUsageResponse(rawBody: string | undefined, auth: AuthFile): CodexAccountUsage | undefined {
  if (!rawBody) {
    return undefined;
  }

  const json = JSON.parse(rawBody) as {
    plan_type?: string;
    rate_limit?: {
      limit_reached?: boolean;
      primary_window?: {used_percent?: number; reset_at?: number};
      secondary_window?: {used_percent?: number; reset_at?: number};
    };
  };

  const sessionUsed = clampPercent(json.rate_limit?.primary_window?.used_percent ?? 0);
  const weeklyUsed = clampPercent(json.rate_limit?.secondary_window?.used_percent ?? 0);
  const sessionResetAt = toIsoString(json.rate_limit?.primary_window?.reset_at);
  const weeklyResetAt = toIsoString(json.rate_limit?.secondary_window?.reset_at);

  return {
    provider: 'codex',
    sessionUsedPercent: sessionUsed,
    sessionRemainingPercent: 100 - sessionUsed,
    sessionResetAt,
    sessionResetLabel: formatResetLabel(sessionResetAt),
    weeklyUsedPercent: weeklyUsed,
    weeklyRemainingPercent: 100 - weeklyUsed,
    weeklyResetAt,
    weeklyResetLabel: formatResetLabel(weeklyResetAt),
    planType: json.plan_type || auth.id_token?.plan_type,
    limitReached: Boolean(json.rate_limit?.limit_reached),
  };
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toIsoString(unixSeconds?: number): string | undefined {
  if (!unixSeconds) {
    return undefined;
  }

  return new Date(unixSeconds * 1000).toISOString();
}

function formatResetLabel(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) {
    return '现在';
  }

  const totalMinutes = Math.max(1, Math.round(diffMs / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}天${hours}小时` : `${days}天`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours}小时${minutes}分` : `${hours}小时`;
  }

  return `${minutes}分`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
