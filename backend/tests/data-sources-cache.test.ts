import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfig, ProviderResult } from '../src/services/providers/types';
import { setupIsolatedCacheDir, teardownIsolatedCacheDir } from './isolatedCacheDir';

function metadata(logicalSource: 'baostock' | 'cninfo' | 'mock') {
  return {
    logical_source: logicalSource,
    access_layer: 'fixture',
    retrieved_at: '2026-06-04T00:00:00.000Z',
    symbol: '600519.SH',
    market: 'SH',
    source_priority_rank: logicalSource === 'mock' ? 999 : 1,
    fallback_used: logicalSource === 'mock',
    raw_field_map: {},
    quality_flags: logicalSource === 'mock' ? ['mock_data'] : [],
  };
}

function dailyBarsResult(logicalSource: 'baostock' | 'cninfo' | 'mock'): ProviderResult<any> {
  return {
    data: [{
      trade_date: '2024-01-02',
      close: logicalSource === 'cninfo' ? 20 : 10,
      metadata: metadata(logicalSource),
    }],
    sourceMetadata: metadata(logicalSource),
    warnings: [],
    attempts: [],
  };
}

const emptyDividendResult: ProviderResult<any> = {
  data: [],
  sourceMetadata: metadata('cninfo'),
  warnings: [],
  attempts: [],
};

const baseArgs = {
  tsCode: '600519.SH',
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  priceMode: 'forward',
  dividendMode: 'dv_ttm',
} as const;

function logicalSourceFromConfig(config: ProviderConfig): 'baostock' | 'cninfo' | 'mock' {
  const singleOverride = config.priorities.daily_bars.length === 1
    ? config.priorities.daily_bars[0]
    : undefined;
  if (singleOverride) return singleOverride as 'baostock' | 'cninfo' | 'mock';
  if (config.enableMockFallback) return 'mock';
  return 'baostock';
}

async function loadDataSourcesWithMockedFetch() {
  vi.resetModules();

  const fetchHistoricalDataWithMeta = vi.fn();

  vi.doMock('../src/services/providers/fallbackManager', () => ({
    createFallbackManager: vi.fn((_providers: unknown, config: ProviderConfig) => {
      const getDailyBars = vi.fn(async () => {
        fetchHistoricalDataWithMeta(config);
        return dailyBarsResult(logicalSourceFromConfig(config));
      });
      return {
        getDailyBars,
        getDividendEvents: vi.fn(async () => emptyDividendResult),
      };
    }),
  }));

  const mod = await import('../src/services/dataSources');
  return { mod, fetchHistoricalDataWithMeta };
}

beforeEach(async () => {
  vi.doUnmock('../src/services/dataSources');
  vi.doUnmock('../src/services/providers/fallbackManager');
  await setupIsolatedCacheDir();
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.doUnmock('../src/services/dataSources');
  vi.doUnmock('../src/services/providers/fallbackManager');
  await teardownIsolatedCacheDir();
});

describe('fetchCachedHistoricalDataWithMeta cache keys', () => {
  it('caches history separately per dataSourceOverride', async () => {
    const { mod, fetchHistoricalDataWithMeta } = await loadDataSourcesWithMockedFetch();

    await mod.fetchCachedHistoricalDataWithMeta(
      baseArgs.tsCode,
      baseArgs.startDate,
      baseArgs.endDate,
      baseArgs.priceMode,
      baseArgs.dividendMode,
      { dataSourceOverride: 'baostock' },
    );
    const second = await mod.fetchCachedHistoricalDataWithMeta(
      baseArgs.tsCode,
      baseArgs.startDate,
      baseArgs.endDate,
      baseArgs.priceMode,
      baseArgs.dividendMode,
      { dataSourceOverride: 'cninfo' },
    );

    expect(second.dataSource).toBe('cninfo');
    expect(fetchHistoricalDataWithMeta).toHaveBeenCalledTimes(2);
  });

  it('caches history separately when allowMockFallback differs', async () => {
    const { mod, fetchHistoricalDataWithMeta } = await loadDataSourcesWithMockedFetch();

    await mod.fetchCachedHistoricalDataWithMeta(
      baseArgs.tsCode,
      baseArgs.startDate,
      baseArgs.endDate,
      baseArgs.priceMode,
      baseArgs.dividendMode,
      { allowMockFallback: false },
    );
    const second = await mod.fetchCachedHistoricalDataWithMeta(
      baseArgs.tsCode,
      baseArgs.startDate,
      baseArgs.endDate,
      baseArgs.priceMode,
      baseArgs.dividendMode,
      { allowMockFallback: true },
    );

    expect(second.dataSource).toBe('mock');
    expect(fetchHistoricalDataWithMeta).toHaveBeenCalledTimes(2);
  });
});
