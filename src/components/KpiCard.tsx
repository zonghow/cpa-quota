import React from 'react';
import {Box, Text} from 'ink';

type KpiCardProps = {
  title: string;
  value: string;
  subtitle: string;
  color?: 'green' | 'yellow' | 'red' | 'blue' | 'magenta' | 'cyan';
};

export function KpiCard({title, value, subtitle, color = 'cyan'}: KpiCardProps) {
  return (
    <Box
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      paddingY={0}
      flexDirection="column"
      width={18}
      marginRight={1}
      marginBottom={1}
    >
      <Text color="gray">{title}</Text>
      <Text color={color} bold>
        {value}
      </Text>
      <Text color="gray">{subtitle}</Text>
    </Box>
  );
}
