import axios from 'axios';
import { DebugReport } from '../format';

interface ApiPingOptions {
  baseUrl?: string;
}

export async function runApiPing(options: ApiPingOptions): Promise<DebugReport> {
  const started = Date.now();
  const baseUrl = String(options.baseUrl ?? process.env.API_BASE_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    ''
  );

  try {
    const health = await axios.get(`${baseUrl}/api/health`, {
      timeout: 5000,
      validateStatus: () => true,
    });

    if (health.status !== 200 || health.data?.features?.secRoe !== true) {
      return {
        command: 'api.ping',
        ok: false,
        durationMs: Date.now() - started,
        data: { baseUrl, health: health.data },
        error: {
          message:
            health.status !== 200
              ? `健康检查返回 HTTP ${health.status}`
              : '后端版本过旧，缺少 SEC ROE 支持，请运行 npm run build:backend 并重启',
        },
        hints: ['先启动后端: npm run dev:backend', 'Electron 生产包需重新 build:backend'],
      };
    }

    const grahamSmoke = await axios.post(
      `${baseUrl}/api/graham/evaluate`,
      {
        inputs: [
          {
            stockCode: 'NVDA',
            startYear: 2023,
            endYear: 2025,
            Y: 1.71,
            market: 'us',
          },
        ],
      },
      { timeout: 30000, validateStatus: () => true }
    );

    const row = grahamSmoke.data?.rows?.[0];
    const evaluateOk = grahamSmoke.status === 200 && (row?.status === 'OK' || row?.status === 'WARNING');

    return {
      command: 'api.ping',
      ok: evaluateOk,
      durationMs: Date.now() - started,
      data: {
        baseUrl,
        health: health.data,
        grahamEvaluate: {
          httpStatus: grahamSmoke.status,
          row,
        },
      },
      error: evaluateOk
        ? undefined
        : {
            message: row?.message ?? `Graham API 异常 HTTP ${grahamSmoke.status}`,
            details: grahamSmoke.data,
          },
      hints: evaluateOk ? undefined : ['检查后端日志与 SEC/Yahoo 网络连通性'],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      command: 'api.ping',
      ok: false,
      durationMs: Date.now() - started,
      data: { baseUrl },
      error: { message },
      hints: ['后端未启动时跳过 api ping；运行 npm run dev:backend'],
    };
  }
}
