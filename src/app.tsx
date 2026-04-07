import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Box, Text } from "ink";
import { ManagementApiClient, ManagementApiError } from "./api/client.js";
import { ProviderCard } from "./components/ProviderCard.js";
import {
  createDashboardData,
  type AuthFileModelInfo,
  type DashboardData,
  type UsageStats,
  type CodexAccountUsage,
} from "./models.js";

type AppProps = {
  inputUrl: string;
  managementKey: string;
  intervalSeconds: number;
  showDisabledByDefault?: boolean;
};

type RefreshState = {
  isLoading: boolean;
  error?: string;
  dashboard?: DashboardData;
  lastUpdated?: Date;
};

const EMPTY_USAGE: UsageStats = {
  usage: {
    total_requests: 0,
    success_count: 0,
    failure_count: 0,
    total_tokens: 0,
    input_tokens: 0,
    output_tokens: 0,
  },
  failed_requests: 0,
};

export function App({
  inputUrl,
  managementKey,
  intervalSeconds,
  showDisabledByDefault = false,
}: AppProps) {
  const client = useMemo(
    () => new ManagementApiClient(inputUrl, managementKey),
    [inputUrl, managementKey],
  );
  const [state, setState] = useState<RefreshState>({ isLoading: true });
  const [secondsUntilRefresh, setSecondsUntilRefresh] =
    useState(intervalSeconds);
  const [showDisabled] = useState(showDisabledByDefault);
  const modelsCacheRef = useRef<Record<string, AuthFileModelInfo[]>>({});
  const codexUsageCacheRef = useRef<Record<string, CodexAccountUsage>>({});
  const authNamesRef = useRef<string[]>([]);
  const refreshInFlightRef = useRef(false);
  const nextRefreshAtRef = useRef(Date.now() + intervalSeconds * 1000);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return false;
    }

    refreshInFlightRef.current = true;
    setSecondsUntilRefresh(0);

    setState((current) => ({
      ...current,
      isLoading: true,
      error: undefined,
    }));

    try {
      const [authFiles, usage] = await Promise.all([
        client.fetchAuthFiles(),
        client.fetchUsage(),
      ]);
      const authNames = authFiles.map((file) => file.name).sort();
      const previousNames = authNamesRef.current;
      const namesChanged =
        authNames.join("\u0000") !== previousNames.join("\u0000");
      const missingNames = authNames.filter(
        (name) => !modelsCacheRef.current[name],
      );

      if (namesChanged) {
        const nextModels = await client.fetchModelsByNames(authNames);
        modelsCacheRef.current = nextModels;
        authNamesRef.current = authNames;
      } else if (missingNames.length > 0) {
        const nextModels = await client.fetchModelsByNames(missingNames);
        modelsCacheRef.current = {
          ...modelsCacheRef.current,
          ...nextModels,
        };
      }

      codexUsageCacheRef.current =
        await client.fetchCodexUsageByAuthFiles(authFiles);

      const dashboard = createDashboardData({
        authFiles,
        usage,
        modelsByName: modelsCacheRef.current,
        codexUsageByAuthIndex: codexUsageCacheRef.current,
      });

      setState({
        isLoading: false,
        dashboard,
        error: undefined,
        lastUpdated: new Date(),
      });

      return true;
    } catch (error) {
      setState((current) => ({
        ...current,
        isLoading: false,
        error: formatError(error),
      }));

      return false;
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [client]);

  useEffect(() => {
    const intervalMs = intervalSeconds * 1000;
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const updateCountdown = () => {
      const remainingMs = Math.max(0, nextRefreshAtRef.current - Date.now());
      setSecondsUntilRefresh(Math.ceil(remainingMs / 1000));
    };

    const scheduleNextRefresh = () => {
      nextRefreshAtRef.current = Date.now() + intervalMs;
      setSecondsUntilRefresh(intervalSeconds);
      refreshTimer = setTimeout(runRefreshLoop, intervalMs);
    };

    const runRefreshLoop = async () => {
      await refresh();

      if (cancelled) {
        return;
      }

      scheduleNextRefresh();
    };

    void runRefreshLoop();
    const countdownTimer = setInterval(updateCountdown, 1000);

    return () => {
      cancelled = true;
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      clearInterval(countdownTimer);
    };
  }, [intervalSeconds, refresh]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box
        borderStyle="round"
        borderColor="cyan"
        flexDirection="column"
        paddingX={1}
        width="100%"
      >
        <Header
          baseUrl={client.baseUrl}
          inputUrl={inputUrl}
          intervalSeconds={intervalSeconds}
          secondsUntilRefresh={secondsUntilRefresh}
          lastUpdated={state.lastUpdated}
          isLoading={state.isLoading}
        />

        {state.error ? <ErrorBanner message={state.error} /> : null}

        {state.dashboard ? (
          <DashboardView
            dashboard={state.dashboard}
            showDisabled={showDisabled}
          />
        ) : state.isLoading ? (
          <LoadingView />
        ) : (
          <EmptyView />
        )}

      </Box>
    </Box>
  );
}

function Header(props: {
  inputUrl: string;
  baseUrl: string;
  intervalSeconds: number;
  secondsUntilRefresh: number;
  lastUpdated?: Date;
  isLoading: boolean;
}) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        <Text bold color="cyanBright">CPA Quota Monitor</Text>
        <Text color="gray"> · {truncateMiddle(props.inputUrl, 72)}</Text>
      </Text>
      <Text>
        <Text color={props.isLoading ? "yellow" : "green"}>
          {props.isLoading ? "刷新中" : "已连接"}
        </Text>
        <Text color="gray">
          {" "}
          · {props.intervalSeconds}s · {props.secondsUntilRefresh}s 后刷新
          ·{" "}
        </Text>
        <Text>
          {props.lastUpdated ? formatDateTime(props.lastUpdated) : "未完成"}
        </Text>
      </Text>
    </Box>
  );
}

function DashboardView({
  dashboard,
  showDisabled,
}: {
  dashboard: DashboardData;
  showDisabled: boolean;
}) {
  const usage = dashboard.usage.usage ?? EMPTY_USAGE.usage;
  const totalRequests = usage.total_requests ?? 0;
  const successCount = usage.success_count ?? 0;
  const failureCount =
    usage.failure_count ?? dashboard.usage.failed_requests ?? 0;
  const successRate =
    totalRequests > 0 ? (successCount / totalRequests) * 100 : 0;
  const providers = dashboard.providers
    .map((provider) => ({
      ...provider,
      accounts: provider.accounts.filter(
        (account) => showDisabled || !account.disabled,
      ),
    }))
    .filter((provider) => provider.accounts.length > 0);

  return (
    <Box flexDirection="column">
      <Text color="gray">
        账号{" "}
        {showDisabled
          ? dashboard.totalAccounts
          : dashboard.totalAccounts - dashboard.disabledAccounts}{" "}
        · 请求 {totalRequests} · 成功率 {Math.round(successRate)}% ·{" "}
        {formatCompact(usage.total_tokens ?? 0)}
      </Text>

      <Box flexDirection="column" marginTop={0} rowGap={1}>
        {providers.length > 0 ? (
          providers.map((provider) => (
            <ProviderCard key={provider.provider} provider={provider} />
          ))
        ) : (
          <Text color="yellow">当前筛选条件下没有账号可展示。</Text>
        )}
      </Box>
    </Box>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <Box borderStyle="round" borderColor="red" paddingX={1} marginBottom={1}>
      <Text color="red">错误：{message}</Text>
    </Box>
  );
}

function LoadingView() {
  return (
    <Box borderStyle="round" borderColor="yellow" paddingX={1} marginBottom={1}>
      <Text color="yellow">正在拉取 CPA 账号状态与 usage…</Text>
    </Box>
  );
}

function EmptyView() {
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
      <Text color="gray">没有可展示的数据。</Text>
    </Box>
  );
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }

  return String(value);
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const edgeLength = Math.max(1, Math.floor((maxLength - 1) / 2));
  return `${value.slice(0, edgeLength)}…${value.slice(-edgeLength)}`;
}

function formatError(error: unknown): string {
  if (error instanceof ManagementApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "出现未知错误。";
}
