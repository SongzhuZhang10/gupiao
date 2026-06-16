import { DailyData } from '../utils/sampling';
import { createFallbackManager } from './providers/fallbackManager';
import { getProviderConfig } from './providers/config';
import { createProviders, fetchEastMoneyDividends } from './providers/adapters';
import {
  DailyBarRecord,
  DividendEventRecord,
  ProviderConfig,
  ProviderAttempt,
  ProviderName,
  SourceMetadata,
} from './providers/types';
import { MarketRegion } from '../utils/stock';
import { calculateDividendYield } from './providers/validation';
import { DEFAULT_CACHE_TTL_MS, withStockCache } from './stockCache';

export type DataSourceName = ProviderName;

export interface HistoricalDataResult {
  data: DailyBarRecord[];
  dataSource: DataSourceName;
  warnings: string[];
  sourceMetadata: SourceMetadata;
  attempts?: ProviderAttempt[];
}

export interface DividendEventsResult {
  data: DividendEventRecord[];
  dataSource: DataSourceName;
  warnings: string[];
  sourceMetadata: SourceMetadata;
  attempts?: ProviderAttempt[];
}

interface FetchDataSourceOptions {
  allowMockFallback?: boolean;
  cacheTtlMs?: number;
  market?: MarketRegion;
  dataSourceOverride?: DataSourceName;
}

function cacheParamsForFetch(
  tsCode: string,
  startDate: string,
  endDate: string,
  options?: FetchDataSourceOptions,
  extra: Record<string, string | boolean> = {}
) {
  return {
    tsCode,
    startDate,
    endDate,
    market: options?.market ?? 'cn',
    dataSourceOverride: options?.dataSourceOverride ?? '',
    allowMockFallback: options?.allowMockFallback === true,
    ...extra,
  };
}

function providerConfigFor(options?: FetchDataSourceOptions): ProviderConfig {
  const config = { ...getProviderConfig(options?.market ?? 'cn') };
  
  if (options?.dataSourceOverride) {
    config.priorities = {
      ...config.priorities,
      daily_bars: [options.dataSourceOverride],
      dividend_events: [options.dataSourceOverride],
    };
  }

  if (!options?.allowMockFallback) return config;
  return {
    ...config,
    enableMockFallback: true,
  };
}

function applyPriceMode(data: DailyBarRecord[], priceMode: string): DailyBarRecord[] {
  if (priceMode === 'unadjusted' || data.length === 0) return data;
  const adjusted = [...data].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const latestAdj = adjusted[adjusted.length - 1].adj_factor || 1;
  const firstAdj = adjusted[0].adj_factor || 1;

  return adjusted.map(row => {
    if (!row.adj_factor) return row;
    if (priceMode === 'forward') {
      return { ...row, close: Number((row.close * (row.adj_factor / latestAdj)).toFixed(2)) };
    }
    if (priceMode === 'backward') {
      return { ...row, close: Number((row.close * (row.adj_factor / firstAdj)).toFixed(2)) };
    }
    return row;
  });
}

async function enrichDividendYields(
  data: DailyBarRecord[],
  unadjustedData: DailyBarRecord[],
  tsCode: string,
  warnings: string[],
  dividendMode: string,
  config: ProviderConfig,
  market: MarketRegion = 'cn'
): Promise<DailyBarRecord[]> {
  if (data.length === 0) return data;
  const manager = createFallbackManager(createProviders(market), config);
  let events;
  const unadjustedCloseByDate = new Map(
    unadjustedData.map(row => [row.trade_date, row.close])
  );

  try {
    events = await manager.getDividendEvents(tsCode, undefined, data[data.length - 1].trade_date);
  } catch (error: any) {
    warnings.push('分红事件数据源不可用，保留供应商股息率字段或空值。');
    return data.map(row => {
      const unadjustedClose = unadjustedCloseByDate.get(row.trade_date) ?? row.close;
      if (row.vendor_dividend_yield !== undefined || row.dividend_yield !== undefined) {
        return {
          ...row,
          unadjusted_close: unadjustedClose,
          dividend_yield: row.vendor_dividend_yield ?? row.dividend_yield,
        };
      }
      return { ...row, unadjusted_close: unadjustedClose };
    });
  }

  return data.map(row => {
    const vendorYield = row.vendor_dividend_yield ?? row.dividend_yield;
    const unadjustedClose = unadjustedCloseByDate.get(row.trade_date) ?? row.close;
    const calculated = calculateDividendYield({
      symbol: tsCode,
      asOfDate: row.trade_date,
      referencePrice: unadjustedClose,
      dividendEvents: events.data,
      priceMetadata: row.metadata,
      vendorDividendYield: vendorYield,
      tolerance: config.dividendYieldTolerance,
      dividendMode,
    });

    return {
      ...row,
      unadjusted_close: unadjustedClose,
      dividend_yield: calculated.dividend_yield,
      calculated_dividend_yield: calculated.calculated_dividend_yield,
      vendor_dividend_yield: vendorYield,
      metadata: {
        ...row.metadata,
        quality_flags: Array.from(new Set([...row.metadata.quality_flags, ...(calculated.quality_flags ?? [])])),
      },
    };
  });
}

export async function fetchHistoricalDataWithMeta(
  tsCode: string,
  startDate: string,
  endDate: string,
  priceMode: string,
  _dividendMode: string,
  options?: FetchDataSourceOptions
): Promise<HistoricalDataResult> {
  const market = options?.market ?? 'cn';
  console.log(`[Data Fetch] Fetching ${tsCode} ${startDate}..${endDate} market=${market} with free provider fallback`);
  const config = providerConfigFor(options);
  const manager = createFallbackManager(createProviders(market), config);
  const result = await manager.getDailyBars(tsCode, startDate, endDate, priceMode);
  const warnings = [...result.warnings];
  const adjustedData = applyPriceMode(result.data, priceMode);
  const enrichedData = await enrichDividendYields(adjustedData, result.data, tsCode, warnings, _dividendMode, config, market);
  const qualityFlags = Array.from(new Set(enrichedData.flatMap(row => row.metadata.quality_flags)));
  const sourceMetadata: SourceMetadata = {
    ...result.sourceMetadata,
    quality_flags: qualityFlags,
  };

  return {
    data: enrichedData,
    dataSource: sourceMetadata.logical_source,
    warnings,
    sourceMetadata,
    attempts: result.attempts,
  };
}

export async function fetchCachedHistoricalDataWithMeta(
  tsCode: string,
  startDate: string,
  endDate: string,
  priceMode: string,
  dividendMode: string,
  options?: FetchDataSourceOptions
): Promise<HistoricalDataResult> {
  return withStockCache({
    dataType: 'history',
    params: cacheParamsForFetch(tsCode, startDate, endDate, options, { priceMode, dividendMode }),
    ttlMs: options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    fetchFresh: () => fetchHistoricalDataWithMeta(tsCode, startDate, endDate, priceMode, dividendMode, options),
  });
}

export async function fetchHistoricalData(
  tsCode: string,
  startDate: string,
  endDate: string,
  priceMode: string,
  dividendMode: string
): Promise<DailyData[]> {
  const result = await fetchHistoricalDataWithMeta(tsCode, startDate, endDate, priceMode, dividendMode);
  return result.data;
}

export async function fetchDividendEventsWithMeta(
  tsCode: string,
  startDate: string | undefined,
  endDate: string,
  options?: FetchDataSourceOptions
): Promise<DividendEventsResult> {
  const market = options?.market ?? 'cn';
  console.log(`[Data Fetch] Fetching dividend events ${tsCode} ..${endDate} market=${market} with free provider fallback`);
  const manager = createFallbackManager(createProviders(market), providerConfigFor(options));
  const result = await manager.getDividendEvents(tsCode, startDate, endDate);

  return {
    data: result.data,
    dataSource: result.sourceMetadata.logical_source,
    warnings: result.warnings,
    sourceMetadata: result.sourceMetadata,
    attempts: result.attempts,
  };
}

export async function fetchCachedDividendEventsWithMeta(
  tsCode: string,
  startDate: string | undefined,
  endDate: string,
  options?: FetchDataSourceOptions
): Promise<DividendEventsResult> {
  return withStockCache({
    dataType: 'dividend-events',
    params: cacheParamsForFetch(tsCode, startDate ?? '', endDate, options),
    ttlMs: options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    fetchFresh: () => fetchDividendEventsWithMeta(tsCode, startDate, endDate, options),
  });
}

export { fetchEastMoneyDividends };
