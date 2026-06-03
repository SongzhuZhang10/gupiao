import { getMockData } from '../../mocks/mockData';
import {
  DailyBarRecord,
  DataProvider,
  DataType,
  DividendEventRecord,
  DividendYieldProviderResult,
  ProviderAttempt,
  ProviderConfig,
  ProviderName,
  ProviderResult,
} from './types';
import {
  calculateDividendYield,
  createProviderError,
  validateDailyBarRecords,
  validateDividendEventRecords,
  validateDividendYieldRecord,
} from './validation';
import { createProviders } from './adapters';
import { getProviderConfig } from './config';

function priorityFor(config: ProviderConfig, dataType: DataType, provider: ProviderName): number {
  const index = config.priorities[dataType].indexOf(provider);
  return index >= 0 ? index + 1 : 999;
}

function byName(providers: DataProvider[]): Map<ProviderName, DataProvider> {
  return new Map(providers.map(provider => [provider.name, provider]));
}

function sourceMetadataFrom<T extends { metadata: any }>(records: T[]) {
  return records[0].metadata;
}

function logAttempt(dataType: DataType, symbol: string, attempt: ProviderAttempt) {
  const suffix = attempt.reason ? `: ${attempt.reason}` : '';
  console.log(`[ProviderFallback] ${dataType} ${symbol} ${attempt.provider} rank=${attempt.priorityRank} ${attempt.status}${suffix}`);
}

function makeMockDailyBars(symbol: string, startDate: string, endDate: string): DailyBarRecord[] {
  const all = getMockData(symbol).sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const ranged = all.filter(d => d.trade_date >= startDate && d.trade_date <= endDate);
  const rows = ranged.length > 0 ? ranged : all;
  return rows.map(d => ({
    trade_date: d.trade_date,
    open: d.close ?? 0,
    high: d.close ?? 0,
    low: d.close ?? 0,
    close: d.close ?? 0,
    volume: 1,
    amount: d.close ?? 0,
    adj_factor: d.adj_factor,
    dividend_yield: d.dividend_yield,
    calculated_dividend_yield: d.dividend_yield,
    metadata: {
      logical_source: 'mock',
      access_layer: 'local_mock_data',
      retrieved_at: new Date().toISOString(),
      symbol,
      market: symbol.endsWith('.SH') ? 'SH' : symbol.endsWith('.SZ') ? 'SZ' : 'UNKNOWN',
      source_priority_rank: 999,
      fallback_used: true,
      raw_field_map: {},
      quality_flags: ['mock_data'],
    },
  }));
}

async function attemptDailyProvider(
  provider: DataProvider,
  symbol: string,
  startDate: string,
  endDate: string,
  adjust: string | undefined,
  rank: number
): Promise<{ records?: DailyBarRecord[]; attempt: ProviderAttempt }> {
  if (!provider.getDailyBars) {
    return {
      attempt: {
        provider: provider.name,
        accessLayer: provider.accessLayer,
        priorityRank: rank,
        status: 'unavailable',
        reason: 'provider does not implement getDailyBars',
      },
    };
  }

  try {
    const records = await provider.getDailyBars(symbol, startDate, endDate, adjust, rank, rank > 1);
    const errors = validateDailyBarRecords(records);
    if (errors.length > 0) {
      return {
        attempt: {
          provider: provider.name,
          accessLayer: provider.accessLayer,
          priorityRank: rank,
          status: 'invalid',
          reason: errors.join('; '),
        },
      };
    }
    return {
      records: records.map(record => ({
        ...record,
        metadata: {
          ...record.metadata,
          source_priority_rank: rank,
          fallback_used: rank > 1,
        },
      })),
      attempt: { provider: provider.name, accessLayer: provider.accessLayer, priorityRank: rank, status: 'success' },
    };
  } catch (error: any) {
    return {
      attempt: {
        provider: provider.name,
        accessLayer: provider.accessLayer,
        priorityRank: rank,
        status: 'failed',
        reason: error?.message ?? String(error),
      },
    };
  }
}

async function attemptDividendProvider(
  provider: DataProvider,
  symbol: string,
  startDate: string | undefined,
  endDate: string | undefined,
  rank: number
): Promise<{ records?: DividendEventRecord[]; attempt: ProviderAttempt }> {
  if (!provider.getDividendEvents) {
    return {
      attempt: {
        provider: provider.name,
        accessLayer: provider.accessLayer,
        priorityRank: rank,
        status: 'unavailable',
        reason: 'provider does not implement getDividendEvents',
      },
    };
  }

  try {
    const records = await provider.getDividendEvents(symbol, startDate, endDate, rank, rank > 1);
    const errors = validateDividendEventRecords(records);
    if (errors.length > 0) {
      return {
        attempt: {
          provider: provider.name,
          accessLayer: provider.accessLayer,
          priorityRank: rank,
          status: 'invalid',
          reason: errors.join('; '),
        },
      };
    }
    return {
      records,
      attempt: { provider: provider.name, accessLayer: provider.accessLayer, priorityRank: rank, status: 'success' },
    };
  } catch (error: any) {
    return {
      attempt: {
        provider: provider.name,
        accessLayer: provider.accessLayer,
        priorityRank: rank,
        status: 'failed',
        reason: error?.message ?? String(error),
      },
    };
  }
}

export function createFallbackManager(providers: DataProvider[] = createProviders(), config: ProviderConfig = getProviderConfig()) {
  const providerMap = byName(providers);

  async function getDailyBars(symbol: string, startDate: string, endDate: string, adjust?: string): Promise<ProviderResult<DailyBarRecord>> {
    const attempts: ProviderAttempt[] = [];

    for (const providerName of config.priorities.daily_bars) {
      const provider = providerMap.get(providerName);
      if (!provider) continue;
      const rank = priorityFor(config, 'daily_bars', providerName);
      const { records, attempt } = await attemptDailyProvider(provider, symbol, startDate, endDate, adjust, rank);
      attempts.push(attempt);
      logAttempt('daily_bars', symbol, attempt);
      if (records) {
        return { data: records, sourceMetadata: sourceMetadataFrom(records), attempts, warnings: [] };
      }
    }

    if (config.enableMockFallback) {
      const data = makeMockDailyBars(symbol, startDate, endDate);
      const attempt: ProviderAttempt = { provider: 'mock', accessLayer: 'local_mock_data', priorityRank: 999, status: 'success', reason: 'explicit mock fallback enabled' };
      attempts.push(attempt);
      logAttempt('daily_bars', symbol, attempt);
      return {
        data,
        sourceMetadata: sourceMetadataFrom(data),
        attempts,
        warnings: ['真实数据源不可用，当前数据基于 Mock 数据降级展示。'],
      };
    }

    throw createProviderError('daily_bars', symbol, attempts);
  }

  async function getDividendEvents(symbol: string, startDate?: string, endDate?: string): Promise<ProviderResult<DividendEventRecord>> {
    const attempts: ProviderAttempt[] = [];

    for (const providerName of config.priorities.dividend_events) {
      const provider = providerMap.get(providerName);
      if (!provider) continue;
      const rank = priorityFor(config, 'dividend_events', providerName);
      const { records, attempt } = await attemptDividendProvider(provider, symbol, startDate, endDate, rank);
      attempts.push(attempt);
      logAttempt('dividend_events', symbol, attempt);
      if (records) {
        return { data: records, sourceMetadata: sourceMetadataFrom(records), attempts, warnings: [] };
      }
    }

    throw createProviderError('dividend_events', symbol, attempts);
  }

  async function getDividendYield(symbol: string, asOfDate?: string): Promise<DividendYieldProviderResult> {
    const date = asOfDate ?? new Date().toISOString().split('T')[0];
    const daily = await getDailyBars(symbol, date, date, 'unadjusted');
    const reference = daily.data[daily.data.length - 1] ?? daily.data[0];
    const vendorYield = reference.vendor_dividend_yield ?? reference.dividend_yield;
    let events: ProviderResult<DividendEventRecord>;
    try {
      events = await getDividendEvents(symbol, undefined, date);
    } catch (error) {
      const fallbackEvent: DividendEventRecord = {
        symbol,
        ex_date: date,
        cash_dividend: vendorYield && reference.close ? Number(((vendorYield * reference.close) / 100).toFixed(4)) : 0,
        dividend_description: 'derived from vendor dividend yield',
        metadata: {
          ...reference.metadata,
          access_layer: 'vendor_yield_fallback',
          quality_flags: [...reference.metadata.quality_flags, 'dividend_events_unavailable'],
        },
      };
      events = {
        data: [fallbackEvent],
        sourceMetadata: fallbackEvent.metadata,
        attempts: (error as any).attempts ?? [],
        warnings: ['分红事件源不可用，股息率使用供应商字段回退计算。'],
      };
    }

    const record = calculateDividendYield({
      symbol,
      asOfDate: reference.trade_date,
      referencePrice: reference.close,
      dividendEvents: events.data,
      priceMetadata: reference.metadata,
      vendorDividendYield: vendorYield,
      tolerance: config.dividendYieldTolerance,
    });
    const errors = validateDividendYieldRecord(record);
    if (errors.length > 0) throw createProviderError('dividend_yield', symbol, [{ provider: record.metadata.logical_source, accessLayer: record.metadata.access_layer, priorityRank: 1, status: 'invalid', reason: errors.join('; ') }]);
    return {
      record,
      attempts: [...daily.attempts, ...events.attempts],
      warnings: [...daily.warnings, ...events.warnings],
    };
  }

  return {
    getDailyBars,
    getDividendEvents,
    getDividendYield,
  };
}

export const defaultFallbackManager = createFallbackManager();
