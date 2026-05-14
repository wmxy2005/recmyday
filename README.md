# Rec My Day

基于 `React Native`、`Expo`、`SQLite` 和 `TypeScript` 的日常记录 App。包括主页、统计页和设定页。

## 技术栈

- Expo SDK 55
- React Native 0.83
- Expo Router bottom tabs
- expo-sqlite
- TypeScript
- npm
- pnpm

## 功能

- 点击主页底部按钮，新增或覆盖当天记录
- 根据设定页的一天开始时间计算当天分钟数
- 可在设定页选择记录单位：小时或分钟，默认分钟
- 可在设定页配置主页最近记录最大显示数量，默认 5
- 主页显示当天记录和最近几天记录
- 统计页按月份筛选，展示当月总分钟数和日历视图
- SQLite 本地持久化 `settings`

## 运行

1. 安装依赖
```bash
pnpm install
```
2. 运行
```bash
npm start
```
常用脚本：

```bash
npm android
npm ios
npm web
npm typecheck
npm lint
```

## 目录

```text
app/
  _layout.tsx
  (tabs)/
    _layout.tsx         
    index.tsx         # 主页
    stats.tsx         # 统计页
    settings.tsx      # 设定页
src/
  data/database.ts
  theme.ts
  utils/date.ts
```


