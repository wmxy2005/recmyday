# Rec My Day

Rec My Day 是一个基于 React Native、Expo、Expo Router、SQLite 和 TypeScript 的日常时间记录 App。应用包含首页、统计页和设置页，数据默认保存在本地 SQLite 数据库中。

## 核心规则

- 记录的 `day_key` 始终使用自然日期，例如 `2026-05-17`。
- “计时开始时间”不影响日期归属，只参与计算当天的分钟数。
- 例如计时开始时间为 `09:00`，当前时间为 `10:30`，当天分钟数为 `90`。
- 如果当前时间早于计时开始时间，当天分钟数按 `0` 处理。

## 功能

- 首页记录当天时间，支持单次覆盖记录和分段记录。
- 设置页可配置计时开始时间、记录单位、首页最近记录数量和分段记录模式。
- 统计页按月份展示记录、日历视图和单日记录明细，并支持手动新增、编辑和删除记录。
- 支持记录导出和导入，导入文件会校验应用标识、schema 版本、数量和 checksum。

## 技术栈

- Expo SDK
- React Native
- Expo Router bottom tabs
- expo-sqlite
- react-i18next / i18next
- TypeScript
- Vitest
- pnpm

## 运行

```bash
pnpm install
pnpm start
```

常用脚本：

```bash
pnpm android
pnpm ios
pnpm web
pnpm typecheck
pnpm lint
pnpm test
```

## 目录

```text
app/
  _layout.tsx
  (tabs)/
    _layout.tsx
    index.tsx       # 首页
    stats.tsx       # 统计页
    settings.tsx    # 设置页
src/
  components/       # 通用组件
  data/database.ts  # SQLite 表结构、迁移和查询
  hooks/            # 共享数据读取 hooks
  i18n/             # 多语言文案
  theme.ts          # 主题 token
  utils/            # 日期、记录格式化、导入导出校验等纯工具
```

## 数据与安全

- 本地数据保存在 SQLite 数据库 `rec-my-day.db` 中。
- `credentials.json`、`credentials/`、keystore、证书和 `.env*.local` 不得提交到仓库。
- 如果凭据曾经提交过，需要轮换 keystore 密码，并从 git 历史中移除敏感文件。
- 导入文件有大小和记录数量上限，避免异常文件阻塞 UI。

## 质量检查

提交前至少运行：

```bash
pnpm typecheck
pnpm lint
pnpm test
```

更多架构和协作约定见 [docs/architecture.md](docs/architecture.md)。
