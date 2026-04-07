import React from 'react';
import {Box, Text} from 'ink';

type ProgressBarProps = {
  value: number;
  width?: number;
  color?: 'green' | 'yellow' | 'red' | 'blue' | 'cyan';
  label?: string;
  compact?: boolean;
};

export function ProgressBar({value, width = 24, color = 'green', label, compact = false}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const filled = Math.round((clamped / 100) * width);
  const empty = Math.max(0, width - filled);

  return (
    <Box>
      {label ? <Text color="gray">{label} </Text> : null}
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(empty)}</Text>
      <Text>{compact ? `${Math.round(clamped)}%` : ` ${Math.round(clamped)}%`}</Text>
    </Box>
  );
}
