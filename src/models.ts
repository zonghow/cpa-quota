export type AuthFileModelInfo = {
  id: string;
  owned_by?: string;
  type?: string;
  display_name?: string;
};

export type CodexIdTokenClaims = {
  chatgpt_account_id?: string;
  plan_type?: string;
  chatgpt_subscription_active_start?: string;
  chatgpt_subscription_active_until?: string;
};

export type AuthFile = {
  id: string;
  name: string;
  provider: string;
  label?: string;
  status: string;
  status_message?: string;
  disabled: boolean;
  unavailable: boolean;
  runtime_only?: boolean;
  source?: string;
  path?: string;
  email?: string;
  account_type?: string;
  account?: string;
  auth_index?: string;
  id_token?: CodexIdTokenClaims;
  created_at?: string;
  updated_at?: string;
  last_refresh?: string;
};

export type AuthFilesResponse = {
  files: AuthFile[];
};

export type UsageData = {
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
};

export type UsageStats = {
  usage?: UsageData;
  failed_requests?: number;
};

export type AuthFileModelsResponse = {
  models: AuthFileModelInfo[];
};

export type CodexAccountUsage = {
  provider: 'codex';
  sessionUsedPercent: number;
  sessionRemainingPercent: number;
  sessionResetAt?: string;
  sessionResetLabel?: string;
  weeklyUsedPercent: number;
  weeklyRemainingPercent: number;
  weeklyResetAt?: string;
  weeklyResetLabel?: string;
  planType?: string;
  limitReached: boolean;
};

export type AccountViewModel = {
  id: string;
  provider: string;
  displayName: string;
  status: string;
  statusMessage?: string;
  disabled: boolean;
  unavailable: boolean;
  modelNames: string[];
  quota?: CodexAccountUsage;
};

export type ProviderGroup = {
  provider: string;
  displayName: string;
  accounts: AccountViewModel[];
  readyCount: number;
  coolingCount: number;
  errorCount: number;
  unavailableCount: number;
  disabledCount: number;
};

export type DashboardData = {
  usage: UsageStats;
  providers: ProviderGroup[];
  totalAccounts: number;
  readyAccounts: number;
  coolingAccounts: number;
  errorAccounts: number;
  unavailableAccounts: number;
  disabledAccounts: number;
};

const providerDisplayNames: Record<string, string> = {
  claude: 'Claude Code',
  'gemini-cli': 'Gemini CLI',
  codex: 'Codex',
  'github-copilot': 'GitHub Copilot',
  copilot: 'GitHub Copilot',
  antigravity: 'Antigravity',
  vertex: 'Vertex AI',
  kiro: 'Kiro',
  qwen: 'Qwen',
  iflow: 'iFlow',
  glm: 'GLM',
  warp: 'Warp',
  cursor: 'Cursor',
  trae: 'Trae',
};

export function getProviderDisplayName(provider: string): string {
  return providerDisplayNames[provider] ?? provider;
}

export function getAccountDisplayName(file: AuthFile): string {
  return file.email || file.account || file.label || file.name;
}

export function getModelNames(models: AuthFileModelInfo[]): string[] {
  return models.map((model) => model.display_name || model.id).filter(Boolean);
}

export function createDashboardData(input: {
  authFiles: AuthFile[];
  usage: UsageStats;
  modelsByName: Record<string, AuthFileModelInfo[]>;
  codexUsageByAuthIndex: Record<string, CodexAccountUsage>;
}): DashboardData {
  const groups = new Map<string, AccountViewModel[]>();

  for (const file of input.authFiles) {
    const provider = file.provider || 'unknown';
    const current = groups.get(provider) ?? [];
    current.push({
      id: file.id,
      provider,
      displayName: getAccountDisplayName(file),
      status: file.status || 'unknown',
      statusMessage: normalizeStatusMessage(file.status_message),
      disabled: file.disabled,
      unavailable: file.unavailable,
      modelNames: getModelNames(input.modelsByName[file.name] ?? []),
      quota: file.auth_index ? input.codexUsageByAuthIndex[file.auth_index] : undefined,
    });
    groups.set(provider, current);
  }

  const providers = [...groups.entries()]
    .map(([provider, accounts]) => {
      const readyCount = accounts.filter((account) => isHealthyStatus(account.status) && !account.disabled && !account.unavailable).length;
      const coolingCount = accounts.filter((account) => account.status === 'cooling').length;
      const errorCount = accounts.filter((account) => account.status === 'error').length;
      const unavailableCount = accounts.filter((account) => account.unavailable).length;
      const disabledCount = accounts.filter((account) => account.disabled).length;

      return {
        provider,
        displayName: getProviderDisplayName(provider),
        accounts: accounts.sort(compareAccounts),
        readyCount,
        coolingCount,
        errorCount,
        unavailableCount,
        disabledCount,
      } satisfies ProviderGroup;
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  const totalAccounts = input.authFiles.length;
  const readyAccounts = providers.reduce((sum, provider) => sum + provider.readyCount, 0);
  const coolingAccounts = providers.reduce((sum, provider) => sum + provider.coolingCount, 0);
  const errorAccounts = providers.reduce((sum, provider) => sum + provider.errorCount, 0);
  const unavailableAccounts = providers.reduce((sum, provider) => sum + provider.unavailableCount, 0);
  const disabledAccounts = providers.reduce((sum, provider) => sum + provider.disabledCount, 0);

  return {
    usage: input.usage,
    providers,
    totalAccounts,
    readyAccounts,
    coolingAccounts,
    errorAccounts,
    unavailableAccounts,
    disabledAccounts,
  };
}

function isHealthyStatus(status: string): boolean {
  return status === 'ready' || status === 'active';
}

function compareAccounts(left: AccountViewModel, right: AccountViewModel): number {
  return (
    rankAccount(left) - rankAccount(right) ||
    left.displayName.localeCompare(right.displayName)
  );
}

function rankAccount(account: AccountViewModel): number {
  if (account.disabled) {
    return 3;
  }

  if (account.unavailable || account.status === 'error') {
    return 2;
  }

  if (account.status === 'cooling') {
    return 1;
  }

  return 0;
}

function normalizeStatusMessage(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) {
    return trimmed;
  }

  try {
    const parsed = JSON.parse(trimmed) as {error?: {message?: string}};
    return parsed.error?.message || trimmed;
  } catch {
    return trimmed;
  }
}
