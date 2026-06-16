import { MarketRegion } from '../../utils/stock';
import { GrahamProviderConfig } from './grahamProviderTypes';

function boolEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function cnGrahamPriorities(): GrahamProviderConfig['priorities'] {
  return {
    snapshot: ['eastmoney', 'daily_bars_bridge'],
    eps_history: ['eastmoney'],
    bvps_history: ['eastmoney'],
    roe: ['eastmoney'],
  };
}

const US_GRAHAM_PRIORITIES: GrahamProviderConfig['priorities'] = {
  snapshot: ['sec_edgar', 'yahoo'],
  eps_history: ['sec_edgar', 'yahoo'],
  bvps_history: ['sec_edgar', 'yahoo'],
  roe: ['sec_edgar'],
};

export const DEFAULT_GRAHAM_PROVIDER_CONFIG: GrahamProviderConfig = {
  priorities: cnGrahamPriorities(),
  enableMockFallback: false,
};

export function getGrahamProviderConfig(market: MarketRegion = 'cn'): GrahamProviderConfig {
  return {
    priorities: market === 'us' ? US_GRAHAM_PRIORITIES : cnGrahamPriorities(),
    enableMockFallback: boolEnv('ENABLE_MOCK_DATA_FALLBACK', DEFAULT_GRAHAM_PROVIDER_CONFIG.enableMockFallback),
  };
}
