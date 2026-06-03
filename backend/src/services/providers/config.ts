import { ProviderConfig } from './types';

function boolEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function numberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  priorities: {
    dividend_events: ['cninfo', 'eastmoney', 'akshare_generic', 'sina', 'sohu'],
    daily_bars: ['baostock', 'eastmoney', 'akshare_generic', 'sina', 'sohu'],
    realtime_quote: ['eastmoney', 'sina', 'akshare_generic', 'sohu'],
    financial_indicators: ['eastmoney', 'akshare_generic', 'sina', 'sohu'],
    dividend_yield: ['cninfo', 'eastmoney', 'akshare_generic', 'sina', 'sohu'],
  },
  timeoutMs: 3000,
  retryCount: 0,
  dividendYieldTolerance: 0.03,
  enableMockFallback: false,
  allowLiveProvidersInTest: false,
};

export function getProviderConfig(): ProviderConfig {
  return {
    ...DEFAULT_PROVIDER_CONFIG,
    timeoutMs: numberEnv('PROVIDER_TIMEOUT_MS', DEFAULT_PROVIDER_CONFIG.timeoutMs),
    retryCount: numberEnv('PROVIDER_RETRY_COUNT', DEFAULT_PROVIDER_CONFIG.retryCount),
    dividendYieldTolerance: numberEnv('DIVIDEND_YIELD_TOLERANCE', DEFAULT_PROVIDER_CONFIG.dividendYieldTolerance),
    enableMockFallback: boolEnv('ENABLE_MOCK_DATA_FALLBACK', DEFAULT_PROVIDER_CONFIG.enableMockFallback),
    allowLiveProvidersInTest: boolEnv('ALLOW_LIVE_PROVIDER_TESTS', DEFAULT_PROVIDER_CONFIG.allowLiveProvidersInTest),
  };
}
