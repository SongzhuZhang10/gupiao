import { DailyData } from '../utils/sampling';
import { createFallbackManager } from './providers/fallbackManager';
import { getProviderConfig } from './providers/config';
import { createProviders, fetchEastMoneyDividends } from './providers/adapters';
import {
  DailyBarRecord,
  ProviderAttempt,
  ProviderName,
  SourceMetadata,
} from './providers/types';
import { calculateDividendYield } from './providers/validation';

export type DataSourceName = ProviderName;

export interface HistoricalDataResult {
  data: DailyData[];
  dataSource: DataSourceName;
  warnings: string[];
  sourceMetadata: SourceMetadata;
  attempts?: ProviderAttempt[];
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

async function enrichDividendYields(data: DailyBarRecord[], tsCode: string, warnings: string[]): Promise<DailyBarRecord[]> {
  if (data.length === 0) return data;
  const config = getProviderConfig();
  const manager = createFallbackManager(createProviders(), config);
  let events;

  try {
    events = await manager.getDividendEvents(tsCode, undefined, data[data.length - 1].trade_date);
  } catch (error: any) {
    warnings.push('分红事件数据源不可用，保留供应商股息率字段或空值。');
    return data.map(row => {
      if (row.vendor_dividend_yield !== undefined || row.dividend_yield !== undefined) {
        return {
          ...row,
          dividend_yield: row.vendor_dividend_yield ?? row.dividend_yield,
        };
      }
      return row;
    });
  }

  return data.map(row => {
    const vendorYield = row.vendor_dividend_yield ?? row.dividend_yield;
    const calculated = calculateDividendYield({
      symbol: tsCode,
      asOfDate: row.trade_date,
      referencePrice: row.close,
      dividendEvents: events.data,
      priceMetadata: row.metadata,
      vendorDividendYield: vendorYield,
      tolerance: config.dividendYieldTolerance,
    });

    return {
      ...row,
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
  _dividendMode: string
): Promise<HistoricalDataResult> {
  console.log(`[Data Fetch] Fetching ${tsCode} ${startDate}..${endDate} with free provider fallback`);
  const manager = createFallbackManager(createProviders(), getProviderConfig());
  const result = await manager.getDailyBars(tsCode, startDate, endDate, priceMode);
  const warnings = [...result.warnings];
  const adjustedData = applyPriceMode(result.data, priceMode);
  const enrichedData = await enrichDividendYields(adjustedData, tsCode, warnings);
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

export { fetchEastMoneyDividends };
