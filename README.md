# A-Share Visualization Dashboard

这是一个用于可视化 A 股股票历史股价和股息率随时间变化情况的全栈 Web 应用。

## 功能特性
- 支持按指定时间段查询 A 股股票数据。
- 自动补全股票代码后缀 (如输入 600519 自动补全为 600519.SH)。
- 内置 Mock 降级机制。当未配置 Tushare Token 时，内置贵州茅台 (600519.SH) 和 平安银行 (000001.SZ) 的历史数据，实现开箱即用。
- 基于 ISO 周，按照“周五 $\rightarrow$ 周四 $\rightarrow$ 周三 $\rightarrow$ 周二 $\rightarrow$ 周一”优先级对历史数据进行周采样。
- 提供股息率与股价的时间序列图表（带数据缩放与导出）。
- 前后端使用 Vite 代理与 concurrently 一键启动。

## 前置要求
- Node.js (推荐 v18+)
- npm 或 yarn

## 1. 如何安装依赖

在项目根目录下，直接安装所有必须依赖（前后端和根目录）：

```bash
npm install
cd frontend && npm install
cd ../backend && npm install
cd ..
```

或者如果您已经运行了上述，可以直接进入前后端目录自行安装。

## 2. 如何设置 TUSHARE_TOKEN

本项目数据来源于 [Tushare Pro](https://tushare.pro/)。
您需要在 `backend` 目录下创建 `.env` 文件，并设置您的 Token：

```bash
# 在 backend 目录下创建 .env 文件
cd backend
echo "TUSHARE_TOKEN=your_token_here" > .env
```

*注意：如果您不配置此项，系统将自动使用内置的 Mock 数据（支持 600519.SH 和 000001.SZ 的数据展示）。*

## 3. 如何运行前端和后端

本项目配置了 concurrently，您只需在**项目根目录**下运行一次命令即可同时启动前端和后端。

```bash
npm run dev
```

前端应用将在 `http://localhost:5173` 启动，后端 API 将在 `http://localhost:3000` 启动，并且前端已配置好代理。

## 4. 如何运行测试

本项目前后端均使用 `Vitest` 进行单元测试。

**运行后端测试：**
```bash
cd backend
npm run test
```
*(覆盖日期、股票代码、采样逻辑和API路由)*

**运行前端测试：**
```bash
cd frontend
npm run test
```

## 5. 已知限制
- Tushare API 的 `daily_basic` (股息率) 接口需要 120 以上的积分权限，部分复权因子接口可能也需要额外权限。如果您遇到接口无权限的情况，系统会自动降级回退到 Mock 数据，以保证界面依然能够渲染。
- `echarts-for-react` 及图表在 `jsdom` (Vitest) 渲染时需要 mock `window.matchMedia` 以及相关 Canvas 接口，因此前端组件测试主要关注其 DOM 渲染的健全性而非深度图表内部交互测试。
- 虽然 `mockData.ts` 使用了随机游走算法生成过去5年的日线数据，但与真实的股票表现并不一致，仅作降级展示用。
