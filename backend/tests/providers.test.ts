import { describe, expect, it, vi } from 'vitest';
import { createFallbackManager } from '../src/services/providers/fallbackManager';
import { DEFAULT_PROVIDER_CONFIG } from '../src/services/providers/config';
import {
  calculateDividendYield,
  createProviderError,
  normalizeDailyBars,
  validateDividendYieldRecord,
  validateRealtimeQuoteRecord,
} from '../src/services/providers/validation';
import {
  DailyBarRecord,
  DataProvider,
  DividendEventRecord,
  ProviderConfig,
} from '../src/services/providers/types';

const baseConfig: ProviderConfig = {
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
      logical_source: source,
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

function dividendEvent(source: string, rank: number, cash = 1): DividendEventRecord {
  return {
    symbol: '600519.SH',
    ex_date: '2024-01-01',
    cash_dividend: cash,
    dividend_description: '10派10元',
    source_reference: 'fixture',
    metadata: {
      logical_source: source,
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

describe('provider fallback manager', () => {
  it('uses configured priority order for daily bars', async () => {
    const calls: string[] = [];
    const manager = createFallbackManager(
      [
        provider('eastmoney', {
          getDailyBars: vi.fn(async () => {
            calls.push('eastmoney');
            return [dailyBar('eastmoney', 2)];
          }),
        }),
        provider('baostock', {
          getDailyBars: vi.fn(async () => {
            calls.push('baostock');
            return [dailyBar('baostock', 1)];
          }),
        }),
      ],
      baseConfig
    );

    const result = await manager.getDailyBars('600519.SH', '2024-01-01', '2024-01-31');

    expect(result.sourceMetadata.logical_source).toBe('baostock');
    expect(result.sourceMetadata.fallback_used).toBe(false);
    expect(calls).toEqual(['baostock']);
  });

  it('falls back when primary provider throws', async () => {
    const manager = createFallbackManager(
      [
        provider('baostock', {
          getDailyBars: vi.fn(async () => {
            throw new Error('python package missing');
          }),
        }),
        provider('eastmoney', {
          getDailyBars: vi.fn(async () => [dailyBar('eastmoney', 2)]),
        }),
      ],
      baseConfig
    );

    const result = await manager.getDailyBars('600519.SH', '2024-01-01', '2024-01-31');

    expect(result.sourceMetadata.logical_source).toBe('eastmoney');
    expect(result.sourceMetadata.fallback_used).toBe(true);
    expect(result.attempts.map(a => a.provider)).toEqual(['baostock', 'eastmoney']);
    expect(result.attempts[0].reason).toContain('python package missing');
  });

  it('falls back when primary provider returns malformed data', async () => {
    const manager = createFallbackManager(
      [
        provider('baostock', {
          getDailyBars: vi.fn(async () => [{ trade_date: '2024-01-02', close: 10 } as DailyBarRecord]),
        }),
        provider('eastmoney', {
          getDailyBars: vi.fn(async () => [dailyBar('eastmoney', 2)]),
        }),
      ],
      baseConfig
    );

    const result = await manager.getDailyBars('600519.SH', '2024-01-01', '2024-01-31');

    expect(result.sourceMetadata.logical_source).toBe('eastmoney');
    expect(result.attempts[0].status).toBe('invalid');
    expect(result.attempts[0].reason).toContain('open');
  });

  it('reports every attempted provider when all fail', async () => {
    const manager = createFallbackManager(
      [
        provider('baostock', {
          getDailyBars: vi.fn(async () => {
            throw new Error('missing baostock');
          }),
        }),
        provider('eastmoney', {
          getDailyBars: vi.fn(async () => []),
        }),
      ],
      baseConfig
    );

    await expect(manager.getDailyBars('600519.SH', '2024-01-01', '2024-01-31')).rejects.toMatchObject({
      name: 'ProviderFallbackError',
      dataType: 'daily_bars',
      symbol: '600519.SH',
      attempts: [
        expect.objectContaining({ provider: 'baostock', status: 'failed' }),
        expect.objectContaining({ provider: 'eastmoney', status: 'invalid' }),
      ],
    });
  });

  it('uses mock only when explicitly enabled', async () => {
    const manager = createFallbackManager(
      [
        provider('baostock', {
          getDailyBars: vi.fn(async () => {
            throw new Error('missing baostock');
          }),
        }),
      ],
      { ...baseConfig, enableMockFallback: true }
    );

    const result = await manager.getDailyBars('600519.SH', '2024-01-01', '2024-01-31');

    expect(result.sourceMetadata.logical_source).toBe('mock');
    expect(result.sourceMetadata.fallback_used).toBe(true);
    expect(result.warnings.join(' ')).toContain('Mock');
  });
});

describe('provider validation and dividend yield', () => {
  it('normalizes daily bars with metadata and raw field maps', () => {
    const normalized = normalizeDailyBars(
      [
        {
          date: '2024-01-02',
          o: '9',
          h: '11',
          l: '8',
          c: '10',
          v: '1000',
          a: '10000',
        },
      ],
      {
        logicalSource: 'eastmoney',
        accessLayer: 'eastmoney_push2his',
        symbol: '600519.SH',
        rank: 2,
        fallbackUsed: true,
        rawFieldMap: {
          trade_date: 'date',
          open: 'o',
          high: 'h',
          low: 'l',
          close: 'c',
          volume: 'v',
          amount: 'a',
        },
      }
    );

    expect(normalized[0]).toMatchObject({
      trade_date: '2024-01-02',
      open: 9,
      high: 11,
      low: 8,
      close: 10,
      volume: 1000,
      amount: 10000,
      metadata: expect.objectContaining({
        logical_source: 'eastmoney',
        access_layer: 'eastmoney_push2his',
        source_priority_rank: 2,
        fallback_used: true,
      }),
    });
  });

  it('validates realtime quotes and dividend yield records', () => {
    expect(
      validateRealtimeQuoteRecord({
        symbol: '600519.SH',
        price: 10,
        quote_time: '2024-01-02T10:00:00.000Z',
        metadata: dailyBar('eastmoney', 1).metadata,
      })
    ).toEqual([]);

    expect(
      validateDividendYieldRecord({
        symbol: '600519.SH',
        as_of_date: '2024-01-02',
        trailing_cash_dividend: 1,
        reference_price: 10,
        dividend_yield: 10,
        calculation_method: 'internal_ttm_cash_dividend/reference_price',
        metadata: dailyBar('eastmoney', 1).metadata,
      })
    ).toEqual([]);
  });

  it('calculates dividend yield internally and flags vendor disagreement beyond tolerance', () => {
    const result = calculateDividendYield({
      symbol: '600519.SH',
      asOfDate: '2024-01-02',
      referencePrice: 10,
      dividendEvents: [dividendEvent('cninfo', 1, 1)],
      priceMetadata: dailyBar('baostock', 1).metadata,
      vendorDividendYield: 8,
      tolerance: 0.03,
    });

    expect(result.dividend_yield).toBe(10);
    expect(result.vendor_dividend_yield).toBe(8);
    expect(result.quality_flags).toContain('needs_review');
    expect(result.quality_flags).toContain('vendor_yield_disagreement');
  });

  it('creates structured provider errors', () => {
    const error = createProviderError('daily_bars', '600519.SH', [
      { provider: 'baostock', accessLayer: 'python_bridge', priorityRank: 1, status: 'failed', reason: 'missing package' },
    ]);

    expect(error).toMatchObject({
      name: 'ProviderFallbackError',
      dataType: 'daily_bars',
      symbol: '600519.SH',
      attempts: [expect.objectContaining({ provider: 'baostock' })],
    });
  });
});
