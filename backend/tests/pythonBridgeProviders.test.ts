import { describe, expect, it, vi } from 'vitest';
import { createFallbackManager } from '../src/services/providers/fallbackManager';
import { DEFAULT_PROVIDER_CONFIG } from '../src/services/providers/config';
import { DailyBarRecord, DataProvider } from '../src/services/providers/types';

const baseConfig = {
  ...DEFAULT_PROVIDER_CONFIG,
  enableMockFallback: false,
  timeoutMs: 50,
  retryCount: 0,
};

function provider(name: string, methods: Partial<DataProvider>): DataProvider {
  return {
    name: name as DataProvider['name'],
    accessLayer: name,
    ...methods,
  };
}

function dailyBar(source: string, rank: number, close = 10): DailyBarRecord {
  return {
    trade_date: '2024-01-02',
    open: 9,
    high: 11,
    low: 8,
    close,
    volume: 1000,
    amount: 10000,
    metadata: {
      logical_source: source as DailyBarRecord['metadata']['logical_source'],
      access_layer: source,
      retrieved_at: '2024-01-02T15:00:00.000Z',
      symbol: '600519.SH',
      market: 'SH',
      source_priority_rank: rank,
      fallback_used: rank > 1,
      raw_field_map: {},
      quality_flags: [],
    },
  };
}

describe('free-source fallback chain', () => {
  it('falls back to akshare when baostock and eastmoney fail', async () => {
    const calls: string[] = [];
    const manager = createFallbackManager(
      [
        provider('baostock', {
          getDailyBars: vi.fn(async () => {
            calls.push('baostock');
            throw new Error('baostock down');
          }),
        }),
        provider('eastmoney', {
          getDailyBars: vi.fn(async () => {
            calls.push('eastmoney');
            throw new Error('eastmoney down');
          }),
        }),
        provider('akshare_generic', {
          getDailyBars: vi.fn(async () => {
            calls.push('akshare_generic');
            return [dailyBar('akshare_generic', 3, 1680)];
          }),
        }),
      ],
      {
        ...baseConfig,
        priorities: {
          ...baseConfig.priorities,
          daily_bars: ['baostock', 'eastmoney', 'akshare_generic'],
        },
      }
    );

    const result = await manager.getDailyBars('600519.SH', '2024-01-01', '2024-01-31');

    expect(result.sourceMetadata.logical_source).toBe('akshare_generic');
    expect(result.data[0].close).toBe(1680);
    expect(calls).toEqual(['baostock', 'eastmoney', 'akshare_generic']);
  });

  it('falls back to tushare after akshare fails', async () => {
    const manager = createFallbackManager(
      [
        provider('akshare_generic', {
          getDailyBars: vi.fn(async () => {
            throw new Error('akshare down');
          }),
        }),
        provider('tushare', {
          getDailyBars: vi.fn(async () => [dailyBar('tushare', 4, 1700)]),
        }),
      ],
      {
        ...baseConfig,
        priorities: {
          ...baseConfig.priorities,
          daily_bars: ['akshare_generic', 'tushare'],
        },
      }
    );

    const result = await manager.getDailyBars('600519.SH', '2024-01-01', '2024-01-31');
    expect(result.sourceMetadata.logical_source).toBe('tushare');
    expect(result.data[0].close).toBe(1700);
  });

  it('falls back to akshare dividend events when cninfo fails', async () => {
    const manager = createFallbackManager(
      [
        provider('cninfo', {
          getDividendEvents: vi.fn(async () => {
            throw new Error('cninfo down');
          }),
        }),
        provider('akshare_generic', {
          getDividendEvents: vi.fn(async () => [
            {
              symbol: '600519.SH',
              ex_date: '2024-06-19',
              cash_dividend: 3.0,
              metadata: dailyBar('akshare_generic', 3).metadata,
            },
          ]),
        }),
      ],
      {
        ...baseConfig,
        priorities: {
          ...baseConfig.priorities,
          dividend_events: ['cninfo', 'akshare_generic'],
        },
      }
    );

    const result = await manager.getDividendEvents('600519.SH', '2020-01-01', '2025-01-01');
    expect(result.sourceMetadata.logical_source).toBe('akshare_generic');
    expect(result.data[0].cash_dividend).toBe(3.0);
  });
});
