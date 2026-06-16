import { MarketRegion } from '../../utils/stock';
import { DataType, ProviderConfig, ProviderName } from './types';

function boolEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function numberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const CN_PROVIDER_PRIORITIES: Record<DataType, ProviderName[]> = {
  dividend_events: ['cninfo', 'eastmoney', 'akshare_generic', 'tushare', 'sina', 'sohu'],
  // sohu/sina tolerate VPN better; baostock/akshare remain as higher-quality fallbacks when reachable.
  daily_bars: ['eastmoney', 'sina', 'sohu', 'tushare', 'baostock', 'akshare_generic'],
  realtime_quote: ['eastmoney', 'sina', 'sohu', 'akshare_generic', 'tushare'],
  financial_indicators: ['eastmoney', 'akshare_generic', 'tushare', 'sina', 'sohu'],
  dividend_yield: ['cninfo', 'eastmoney', 'akshare_generic', 'tushare', 'sina', 'sohu'],
};

const US_PROVIDER_PRIORITIES: Record<DataType, ProviderName[]> = {
  dividend_events: ['yahoo'],
  daily_bars: ['yahoo'],
  realtime_quote: ['yahoo'],
  financial_indicators: ['yahoo'],
  dividend_yield: ['yahoo'],
};

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  priorities: CN_PROVIDER_PRIORITIES,
  timeoutMs: 3000,
  retryCount: 0,
  dividendYieldTolerance: 0.03,
  enableMockFallback: false,
  allowLiveProvidersInTest: false,
};

function resolvedTimeoutMs(market: MarketRegion): number {
  const configured = numberEnv('PROVIDER_TIMEOUT_MS', DEFAULT_PROVIDER_CONFIG.timeoutMs);
  if (process.env.NODE_ENV === 'test') {
    return Math.min(configured, DEFAULT_PROVIDER_CONFIG.timeoutMs);
  }
  // VPN / proxy environments need more headroom for domestic endpoints.
  if (market === 'us') return Math.max(configured, 15000);
  return Math.max(configured, 8000);
}

const CN_PROVIDER_TIMEOUT_OVERRIDES: Partial<Record<ProviderName, number>> = {
  baostock: 4000,
  eastmoney: 5000,
  akshare_generic: 5000,
  tushare: 8000,
  cninfo: 8000,
  sina: 5000,
  sohu: 5000,
};

export function getProviderTimeoutMs(provider: ProviderName, market: MarketRegion = 'cn'): number {
  const base = resolvedTimeoutMs(market);
  if (market !== 'cn') return base;
  return CN_PROVIDER_TIMEOUT_OVERRIDES[provider] ?? base;
}

export function getProviderConfig(market: MarketRegion = 'cn'): ProviderConfig {
  return {
    ...DEFAULT_PROVIDER_CONFIG,
    priorities: market === 'us' ? US_PROVIDER_PRIORITIES : CN_PROVIDER_PRIORITIES,
    timeoutMs: resolvedTimeoutMs(market),
    retryCount: numberEnv('PROVIDER_RETRY_COUNT', DEFAULT_PROVIDER_CONFIG.retryCount),
    dividendYieldTolerance: numberEnv('DIVIDEND_YIELD_TOLERANCE', DEFAULT_PROVIDER_CONFIG.dividendYieldTolerance),
    enableMockFallback: boolEnv('ENABLE_MOCK_DATA_FALLBACK', DEFAULT_PROVIDER_CONFIG.enableMockFallback),
    allowLiveProvidersInTest: boolEnv('ALLOW_LIVE_PROVIDER_TESTS', DEFAULT_PROVIDER_CONFIG.allowLiveProvidersInTest),
  };
}
