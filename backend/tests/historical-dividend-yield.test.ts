import { describe, expect, it, vi } from 'vitest';
import { DailyBarRecord, DividendEventRecord, ProviderConfig, ProviderResult } from '../src/services/providers/types';
import { DEFAULT_PROVIDER_CONFIG } from '../src/services/providers/config';

const dailyBarsResult: ProviderResult<DailyBarRecord> = {
  data: [],
  sourceMetadata: {
    logical_source: 'baostock',
    access_layer: 'fixture',
    retrieved_at: '2026-06-04T00:00:00.000Z',
    symbol: '600519.SH',
    market: 'SH',
    source_priority_rank: 1,
    fallback_used: false,
    raw_field_map: {},
    quality_flags: [],
  },
  attempts: [],
  warnings: [],
};

const dividendEventsResult: ProviderResult<DividendEventRecord> = {
  data: [],
  sourceMetadata: {
    logical_source: 'cninfo',
    access_layer: 'fixture',
    retrieved_at: '2026-06-04T00:00:00.000Z',
    symbol: '600519.SH',
    market: 'SH',
    source_priority_rank: 1,
    fallback_used: false,
    raw_field_map: {},
    quality_flags: [],
  },
  attempts: [],
  warnings: [],
};

vi.mock('../src/services/providers/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/services/providers/config')>();
  return {
    ...actual,
    getProviderConfig: vi.fn((): ProviderConfig => ({
      ...DEFAULT_PROVIDER_CONFIG,
      enableMockFallback: false,
      timeoutMs: 50,
      retryCount: 0,
    })),
  };
});

vi.mock('../src/services/providers/adapters', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/services/providers/adapters')>();
  return {
    ...actual,
    createProviders: vi.fn(() => []),
  };
});

vi.mock('../src/services/providers/fallbackManager', () => {
  return {
    createFallbackManager: vi.fn(() => ({
      getDailyBars: vi.fn(async () => dailyBarsResult),
      getDividendEvents: vi.fn(async () => dividendEventsResult),
    })),
  };
});

function metadata() {
  return {
    logical_source: 'baostock' as const,
    access_layer: 'fixture',
    retrieved_at: '2026-06-04T00:00:00.000Z',
    symbol: '600519.SH',
    market: 'SH',
    source_priority_rank: 1,
    fallback_used: false,
    raw_field_map: {},
    quality_flags: [],
  };
}

describe('fetchHistoricalDataWithMeta dividend yield calculation', () => {
  it('uses the unadjusted close as dividend yield denominator even when price mode adjusts chart prices', async () => {
    dailyBarsResult.data = [
      {
        trade_date: '2024-01-02',
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 1,
        adj_factor: 1,
        metadata: metadata(),
      },
      {
        trade_date: '2024-01-03',
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 1,
        adj_factor: 2,
        metadata: metadata(),
      },
    ];
    dividendEventsResult.data = [
      {
        symbol: '600519.SH',
        ex_date: '2024-01-02',
        cash_dividend: 5,
        metadata: { ...metadata(), logical_source: 'cninfo' },
      },
    ];

    const { fetchHistoricalDataWithMeta } = await import('../src/services/dataSources');
    const result = await fetchHistoricalDataWithMeta('600519.SH', '2024-01-02', '2024-01-03', 'forward', 'dv_ttm');

    expect(result.data[0].close).toBe(50);
    expect(result.data[0].dividend_yield).toBe(5);
    expect(result.data[0].calculated_dividend_yield).toBe(5);
  });
});
