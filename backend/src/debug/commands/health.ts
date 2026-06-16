import { DebugReport } from '../format';
import { getProviderConfig } from '../../services/providers/config';

export function runHealthCheck(): DebugReport {
  const started = Date.now();
  const cn = getProviderConfig('cn');
  const us = getProviderConfig('us');

  return {
    command: 'health',
    ok: true,
    durationMs: Date.now() - started,
    data: {
      nodeEnv: process.env.NODE_ENV ?? 'development',
      providerTimeoutMs: cn.timeoutMs,
      allowLiveProviderTests: process.env.ALLOW_LIVE_PROVIDER_TESTS === 'true',
      enableMockFallback: cn.enableMockFallback,
      markets: {
        cn: { dailyBars: cn.priorities.daily_bars },
        us: { dailyBars: us.priorities.daily_bars },
      },
    },
    hints: [
      '一键自检: npm run verify（根目录）或 npm run debug -- verify all --skip-api',
      'Live 冒烟: npm run debug -- verify live',
      '模拟 GUI 全部刷新: npm run debug -- graham refresh-pool --market us --codes NVDA,AAPL',
    ],
  };
}
