import { DailyData } from '../../utils/sampling';

export type ProviderName = 'baostock' | 'eastmoney' | 'akshare_generic' | 'sina' | 'sohu' | 'cninfo' | 'mock';
export type DataType = 'daily_bars' | 'realtime_quote' | 'dividend_events' | 'financial_indicators' | 'dividend_yield';

export interface SourceMetadata {
  logical_source: ProviderName;
  access_layer: string;
  retrieved_at: string;
  symbol: string;
  market: string;
  source_priority_rank: number;
  fallback_used: boolean;
  raw_field_map: Record<string, string>;
  quality_flags: string[];
}

export interface DailyBarRecord extends DailyData {
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
  vendor_dividend_yield?: number;
  calculated_dividend_yield?: number;
  metadata: SourceMetadata;
}

export interface RealtimeQuoteRecord {
  symbol: string;
  price?: number;
  last?: number;
  quote_time?: string;
  timestamp?: string;
  previous_close?: number;
  metadata: SourceMetadata;
}

export interface DividendEventRecord {
  symbol: string;
  ex_date?: string;
  announcement_date?: string;
  record_date?: string;
  cash_dividend?: number;
  dividend_description?: string;
  source_reference?: string;
  metadata: SourceMetadata;
}

export interface FinancialIndicatorRecord {
  symbol: string;
  period?: string;
  fields: Record<string, number | string | null>;
  metadata: SourceMetadata;
}

export interface DividendYieldRecord {
  symbol: string;
  as_of_date: string;
  dividend_per_share?: number;
  trailing_cash_dividend?: number;
  reference_price: number;
  dividend_yield: number;
  vendor_dividend_yield?: number;
  calculated_dividend_yield?: number;
  calculation_method: string;
  quality_flags?: string[];
  metadata: SourceMetadata;
}

export interface ProviderAttempt {
  provider: ProviderName;
  accessLayer: string;
  priorityRank: number;
  status: 'success' | 'failed' | 'invalid' | 'unavailable';
  reason?: string;
}

export class ProviderFallbackError extends Error {
  readonly name = 'ProviderFallbackError';
  readonly dataType: DataType;
  readonly symbol: string;
  readonly attempts: ProviderAttempt[];

  constructor(dataType: DataType, symbol: string, attempts: ProviderAttempt[]) {
    super(`All providers failed for ${dataType} ${symbol}`);
    this.dataType = dataType;
    this.symbol = symbol;
    this.attempts = attempts;
  }
}

export interface ProviderConfig {
  priorities: Record<DataType, ProviderName[]>;
  timeoutMs: number;
  retryCount: number;
  dividendYieldTolerance: number;
  enableMockFallback: boolean;
  allowLiveProvidersInTest: boolean;
}

export interface ProviderResult<T> {
  data: T[];
  sourceMetadata: SourceMetadata;
  attempts: ProviderAttempt[];
  warnings: string[];
}

export interface DividendYieldProviderResult {
  record: DividendYieldRecord;
  attempts: ProviderAttempt[];
  warnings: string[];
}

export interface DataProvider {
  name: ProviderName;
  accessLayer: string;
  getDailyBars?: (symbol: string, startDate: string, endDate: string, adjust?: string, rank?: number, fallbackUsed?: boolean) => Promise<DailyBarRecord[]>;
  getRealtimeQuote?: (symbol: string, rank?: number, fallbackUsed?: boolean) => Promise<RealtimeQuoteRecord>;
  getDividendEvents?: (symbol: string, startDate?: string, endDate?: string, rank?: number, fallbackUsed?: boolean) => Promise<DividendEventRecord[]>;
  getFinancialIndicators?: (symbol: string, period?: string, rank?: number, fallbackUsed?: boolean) => Promise<FinancialIndicatorRecord[]>;
  getDividendYield?: (symbol: string, asOfDate?: string, rank?: number, fallbackUsed?: boolean) => Promise<DividendYieldRecord>;
}
