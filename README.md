# cpa-quota

在终端里监控 CPA Management API 的账号配额与 usage。

`cpa-quota` 是一个基于 Ink 的 CLI，可用于：
- 查看整体请求量、成功率、总 tokens
- 按 provider 展示账号列表
- 查看每个账号的 `S` / `W` 配额进度条
- 查看每个 provider 的汇总 `S` / `W` usage
- 可选显示已禁用账号

## 使用方式

直接通过 `npx` 运行：

```bash
npx cpa-quota --url "https://your-cpa-host" --password "YOUR_MANAGEMENT_API_KEY"
```

也可以指定刷新间隔：

```bash
npx cpa-quota --url "https://your-cpa-host" --password "YOUR_MANAGEMENT_API_KEY" --interval 30
```

显示禁用账号：

```bash
npx cpa-quota --url "https://your-cpa-host" --password "YOUR_MANAGEMENT_API_KEY" --show-disabled
```

## 参数

| 参数 | 说明 |
| --- | --- |
| `-u, --url <url>` | CPA 地址，例如 `https://example.com/CPA` |
| `-p, --password <password>` | CPA Management API key |
| `-i, --interval <seconds>` | 刷新间隔，单位秒，默认 `60` |
| `--show-disabled` | 显示已禁用账号 |

## 界面说明

- 顶部显示当前连接状态、下次刷新倒计时、最近刷新时间
- 中部显示整体 usage 摘要：账号数、请求数、成功率、总 tokens
- 每个 provider 卡片显示：
  - provider 名称
  - 账号数量
  - provider 级别汇总 `S / W` 进度条
  - 每个账号的邮箱/名称、套餐类型、`S / W` 进度条、重置时间

其中：
- `S` 表示 session 维度的剩余额度
- `W` 表示 weekly 维度的剩余额度

## 颜色规则

进度条按剩余额度区分颜色：
- `0 ~ 30`：红色
- `30 ~ 70`：黄色
- `70 ~ 100`：绿色

## API 说明

程序会使用 CPA Management API 获取数据，主要包括：
- `/v0/management/usage`
- `/v0/management/auth-files`
- `/v0/management/auth-files/models`
- `/v0/management/api-call`

对于不同部署路径，程序会自动尝试常见的 Management API 基础路径。

## 本地开发

安装依赖：

```bash
npm install
```

开发模式：

```bash
npm run dev -- --url "https://your-cpa-host/CPA" --password "YOUR_MANAGEMENT_API_KEY"
```

构建：

```bash
npm run build
```

构建后运行：

```bash
node dist/cli.js --url "https://your-cpa-host/CPA" --password "YOUR_MANAGEMENT_API_KEY"
```

## Node 版本

需要 Node.js `>= 18`。
