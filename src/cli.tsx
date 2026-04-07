import React from 'react';
import {render} from 'ink';
import {Command} from 'commander';
import {App} from './app.js';

const program = new Command();

program
  .name('cpa-quota')
  .description('在终端监控远程 CPA 的账号状态与 usage')
  .requiredOption('-u, --url <url>', 'CPA 地址，例如 https://example.com/CPA')
  .requiredOption('-p, --password <password>', 'CPA Management API key')
  .option('-i, --interval <seconds>', '刷新间隔，单位秒，默认 60', '60')
  .option('--show-disabled', '显示已禁用账号')
  .showHelpAfterError();

program.parse();

const options = program.opts<{
  url: string;
  password: string;
  interval: string;
  showDisabled?: boolean;
}>();

const intervalSeconds = Number.parseInt(options.interval, 10);

if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
  console.error('`--interval` 必须是大于 0 的整数秒。');
  process.exit(1);
}

if (process.stdout.isTTY) {
  process.stdout.write('\u001b[2J\u001b[3J\u001b[H');
}

render(
  <App
    inputUrl={options.url}
    managementKey={options.password}
    intervalSeconds={intervalSeconds}
    showDisabledByDefault={Boolean(options.showDisabled)}
  />,
);
