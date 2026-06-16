import {
  GrahamBvpsRecord,
  GrahamEpsRecord,
  GrahamRoeRecord,
  GrahamStockDataProvider,
  GrahamStockSnapshot,
} from '../grahamDataProvider';

export type GrahamProviderName =
  | 'eastmoney'
  | 'sec_edgar'
  | 'yahoo'
  | 'daily_bars_bridge'
  | 'mock';

export type GrahamDataType = 'snapshot' | 'eps_history' | 'bvps_history' | 'roe';

export interface GrahamProviderAttempt {
  provider: GrahamProviderName;
  accessLayer: string;
  priorityRank: number;
  status: 'success' | 'failed' | 'invalid' | 'unavailable';
  reason?: string;
}

export class GrahamProviderFallbackError extends Error {
  readonly name = 'GrahamProviderFallbackError';
  readonly dataType: GrahamDataType;
  readonly symbol: string;
  readonly attempts: GrahamProviderAttempt[];

  constructor(dataType: GrahamDataType, symbol: string, attempts: GrahamProviderAttempt[]) {
    super(`All Graham providers failed for ${dataType} ${symbol}`);
    this.dataType = dataType;
    this.symbol = symbol;
    this.attempts = attempts;
  }
}

export interface GrahamProviderConfig {
  priorities: Record<GrahamDataType, GrahamProviderName[]>;
  enableMockFallback: boolean;
}

export interface NamedGrahamProvider extends GrahamStockDataProvider {
  name: GrahamProviderName;
  accessLayer: string;
}
