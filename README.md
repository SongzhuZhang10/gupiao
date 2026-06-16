# A-Share Visualization Dashboard

这是一个用于可视化 A 股股票历史股价和股息率随时间变化情况的全栈 Web 应用。

## 功能特性
- 支持按指定时间段查询 A 股股票数据。
- 自动补全股票代码后缀 (如输入 600519 自动补全为 600519.SH)。
- 使用免费/公开数据源优先的 provider fallback 系统，不依赖 Tushare Pro、Wind、iFinD、Choice 终端或任何私有 API Key。
- 按数据类型配置不同数据源优先级，并在接口和 GUI 中保留数据来源、访问层、降级状态和质量标记。
- 内置 Mock 数据仅用于显式开启的开发或测试降级。
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

## 2. 数据源优先级与配置

本项目不使用付费终端数据源。Provider 优先级按数据类型配置：

- 历史日线 / K 线：Baostock → Eastmoney → AKShare → Tushare 免费版 → Sina → Sohu
- 分红、公司行动、公告和披露：CNINFO / 巨潮资讯 → Eastmoney → AKShare → Tushare 免费版 → Sina → Sohu
- 实时行情：Eastmoney → Sina → AKShare 通用接口 → Sohu
- 股息率：优先由项目内部用现金分红和参考收盘价计算，再保留供应商字段作为对照

Baostock、AKShare、Tushare 和 CNINFO 相关访问通过 Python bridge 调用。安装依赖：

```bash
cd backend
pip install -r requirements.txt
```

在 `backend/.env` 配置 `TUSHARE_TOKEN`（[Tushare 免费注册](https://tushare.pro) 获取）。未安装 Python 包、未配置 token、接口不可用、超时、限流或返回结构异常时，系统会记录失败原因并尝试下一个 provider。默认情况下，所有真实免费数据源均失败时 API 会返回结构化错误，不会静默返回伪数据。

可在 `backend/.env` 中调整：

```bash
cd backend
cat > .env <<'EOF'
PROVIDER_TIMEOUT_MS=3000
PROVIDER_RETRY_COUNT=0
DIVIDEND_YIELD_TOLERANCE=0.03
ENABLE_MOCK_DATA_FALLBACK=false
ALLOW_LIVE_PROVIDER_TESTS=false
PYTHON_BIN=python3
EOF
```

开发时如需显式使用内置 Mock 降级，可设置 `ENABLE_MOCK_DATA_FALLBACK=true`。这不应作为生产默认数据源。

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
- 免费/公开数据源可能存在接口变动、限流、字段缺失或延迟。系统会验证 schema，记录每个 provider 的失败原因，并在成功结果中保留 `logical_source`、`access_layer`、`fallback_used`、`raw_field_map` 和 `quality_flags`。
- Baostock 和 AKShare 通过可选 Python bridge 接入。未安装相关 Python 包时，provider 会被视为不可用并继续 fallback。
- 股息率默认优先内部计算：使用最佳可用分红事件和参考收盘价。供应商股息率会保留为对照字段；当相对差异超过 `DIVIDEND_YIELD_TOLERANCE`（默认 3%）时，记录会标记 `needs_review`。
- Sohu 和 Sina 仅作为低优先级 fallback，不作为核心长期历史数据库的主来源。
- `echarts-for-react` 及图表在 `jsdom` (Vitest) 渲染时需要 mock `window.matchMedia` 以及相关 Canvas 接口，因此前端组件测试主要关注其 DOM 渲染的健全性而非深度图表内部交互测试。
- 虽然 `mockData.ts` 使用了随机游走算法生成过去5年的日线数据，但与真实的股票表现并不一致，仅作显式开发/测试降级展示用。

## 6. 如何添加新 provider

1. 在 `backend/src/services/providers/types.ts` 中确认 provider 名称和数据类型接口。
2. 在 `backend/src/services/providers/adapters.ts` 中新增 adapter，返回标准化 record，并填充 source metadata。
3. 在 `backend/src/services/providers/validation.ts` 中复用或扩展 schema 校验。
4. 在 `backend/src/services/providers/config.ts` 中把 provider 放入对应数据类型的优先级列表。
5. 在 `backend/tests/providers.test.ts` 中添加优先级、fallback、malformed schema 和结构化错误测试。
