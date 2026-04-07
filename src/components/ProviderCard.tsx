import React from "react";
import { Box, Text } from "ink";
import type { ProviderGroup } from "../models.js";
import { ProgressBar } from "./ProgressBar.js";

type ProviderCardProps = {
  provider: ProviderGroup;
};

export function ProviderCard({ provider }: ProviderCardProps) {
  const providerQuota = summarizeProviderQuota(provider.accounts);

  return (
    <Box
      borderStyle="round"
      borderColor="blue"
      paddingX={1}
      flexDirection="column"
      width="100%"
    >
      <Box flexWrap="wrap" columnGap={2} rowGap={1}>
        <Text bold color="cyan">
          {provider.displayName}
        </Text>
        <Text color="gray">· {provider.accounts.length} 个账号</Text>
        {providerQuota ? (
          <>
            <ProgressBar
              value={providerQuota.sessionRemainingPercent}
              width={12}
              color={quotaColor(providerQuota.sessionRemainingPercent, false)}
              label="S"
              compact
            />
            <ProgressBar
              value={providerQuota.weeklyRemainingPercent}
              width={12}
              color={quotaColor(providerQuota.weeklyRemainingPercent, false)}
              label="W"
              compact
            />
          </>
        ) : null}
      </Box>

      <Box marginTop={1} flexWrap="wrap" columnGap={4} rowGap={1}>
        {provider.accounts.map((account) => (
          <Box key={account.id} width={42}>
            <AccountCard account={account} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function AccountCard({
  account,
}: {
  account: ProviderGroup["accounts"][number];
}) {
  return (
    <Box flexDirection="column" width={38}>
      <Box justifyContent="space-between">
        <Box flexGrow={1} marginRight={1}>
          <Text bold>{truncate(account.displayName, 26)}</Text>
        </Box>
        <Text color="gray">{account.quota?.planType ?? "—"}</Text>
      </Box>
      {account.quota ? <QuotaSummaryLine account={account} /> : null}
    </Box>
  );
}

function QuotaSummaryLine({
  account,
}: {
  account: ProviderGroup["accounts"][number];
}) {
  if (!account.quota || account.quota.provider !== "codex") {
    return null;
  }

  const sessionColor = quotaColor(
    account.quota.sessionRemainingPercent,
    account.quota.limitReached,
  );
  const weeklyColor = quotaColor(
    account.quota.weeklyRemainingPercent,
    account.quota.limitReached,
  );

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <ProgressBar
          value={account.quota.sessionRemainingPercent}
          width={20}
          color={sessionColor}
          label="S"
          compact
        />
        <Text color="gray">{account.quota.sessionResetLabel ?? "—"}</Text>
      </Box>
      <Box justifyContent="space-between">
        <ProgressBar
          value={account.quota.weeklyRemainingPercent}
          width={20}
          color={weeklyColor}
          label="W"
          compact
        />
        <Text color="gray">{account.quota.weeklyResetLabel ?? "—"}</Text>
      </Box>
    </Box>
  );
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function summarizeProviderQuota(accounts: ProviderGroup["accounts"]) {
  const quotaAccounts = accounts.filter(
    (account) => account.quota?.provider === "codex",
  );

  if (quotaAccounts.length === 0) {
    return undefined;
  }

  const sessionRemainingPercent =
    quotaAccounts.reduce(
      (sum, account) => sum + (account.quota?.sessionRemainingPercent ?? 0),
      0,
    ) / quotaAccounts.length;
  const weeklyRemainingPercent =
    quotaAccounts.reduce(
      (sum, account) => sum + (account.quota?.weeklyRemainingPercent ?? 0),
      0,
    ) / quotaAccounts.length;

  return {
    sessionRemainingPercent,
    weeklyRemainingPercent,
  };
}

function quotaColor(
  remaining: number,
  limitReached: boolean,
): "green" | "yellow" | "red" {
  if (limitReached || remaining <= 30) {
    return "red";
  }

  if (remaining <= 70) {
    return "yellow";
  }

  return "green";
}
