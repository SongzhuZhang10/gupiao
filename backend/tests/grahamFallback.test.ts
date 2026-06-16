import { describe, expect, it } from 'vitest';
import { createFallbackGrahamDataProvider } from '../src/services/graham/grahamFallbackManager';
import {
  DEFAULT_GRAHAM_PROVIDER_CONFIG,
  GrahamProviderConfig,
} from '../src/services/graham/grahamProviderConfig';
import {
  GrahamBvpsRecord,
  GrahamEpsRecord,
  GrahamRoeRecord,
  GrahamStockDataProvider,
  GrahamStockSnapshot,
} from '../src/services/grahamDataProvider';
import { NamedGrahamProvider } from '../src/services/graham/grahamProviderTypes';

const baseConfig: GrahamProviderConfig = {
  ...DEFAULT_GRAHAM_PROVIDER_CONFIG,
  enableMockFallback: false,
};

function namedProvider(
  name: NamedGrahamProvider['name'],
  methods: Partial<GrahamStockDataProvider>
): NamedGrahamProvider {
  return {
    name,
    accessLayer: name,
    getStockSnapshot: methods.getStockSnapshot ?? (async () => {
      throw new Error(`${name} snapshot unavailable`);
    }),
    getAdjustedEpsHistory: methods.getAdjustedEpsHistory ?? (async () => {
      throw new Error(`${name} eps unavailable`);
    }),
    getBvpsHistory: methods.getBvpsHistory ?? (async () => {
      throw new Error(`${name} bvps unavailable`);
    }),
    getLatestRoe: methods.getLatestRoe ?? (async () => {
      throw new Error(`${name} roe unavailable`);
    }),
  };
}

const snapshot: GrahamStockSnapshot = {
  stockCode: '600519.SH',
  stockName: '贵州茅台',
  currentPrice: 1500,
  priceAsOfDate: '2026-06-11',
};

const epsRows: GrahamEpsRecord[] = [
  { year: 2022, adjustedEps: 49.99 },
  { year: 2023, adjustedEps: 59.51 },
];

const bvpsRows: GrahamBvpsRecord[] = [
  { year: 2022, bvps: 170.12 },
  { year: 2023, bvps: 185.56 },
];

const roe: GrahamRoeRecord = { year: 2023, roe: 34.2 };

describe('Graham provider fallback', () => {
  it('uses configured priority order for stock snapshots', async () => {
    const calls: string[] = [];
    const provider = createFallbackGrahamDataProvider(
      [
        namedProvider('eastmoney_api', {
          getStockSnapshot: async () => {
            calls.push('eastmoney_api');
            return snapshot;
          },
        }),
        namedProvider('eastmoney', {
          getStockSnapshot: async () => {
            calls.push('eastmoney');
            return { ...snapshot, currentPrice: 1490 };
          },
        }),
        namedProvider('daily_bars_bridge', {
          getStockSnapshot: async () => {
            calls.push('daily_bars_bridge');
            return { ...snapshot, currentPrice: 1480 };
          },
        }),
      ],
      {
        ...baseConfig,
        priorities: {
          ...baseConfig.priorities,
          snapshot: ['eastmoney_api', 'eastmoney', 'daily_bars_bridge'],
        },
      }
    );

    const result = await provider.getStockSnapshot('600519.SH');

    expect(result.currentPrice).toBe(1500);
    expect(calls).toEqual(['eastmoney_api']);
  });

  it('falls back from eastmoney_api to eastmoney when API key request fails', async () => {
    const provider = createFallbackGrahamDataProvider(
      [
        namedProvider('eastmoney_api', {
          getStockSnapshot: async () => {
            throw new Error('Request failed with status code 401');
          },
        }),
        namedProvider('eastmoney', {
          getStockSnapshot: async () => ({ ...snapshot, currentPrice: 1495 }),
        }),
      ],
      baseConfig
    );

    const result = await provider.getStockSnapshot('600519.SH');

    expect(result.currentPrice).toBe(1495);
  });

  it('falls back to the next snapshot provider when the primary throws', async () => {
    const provider = createFallbackGrahamDataProvider(
      [
        namedProvider('eastmoney', {
          getStockSnapshot: async () => {
            throw new Error('eastmoney quote timeout');
          },
        }),
        namedProvider('daily_bars_bridge', {
          getStockSnapshot: async () => ({ ...snapshot, currentPrice: 1490 }),
        }),
      ],
      {
        ...baseConfig,
        priorities: {
          ...baseConfig.priorities,
          snapshot: ['eastmoney', 'daily_bars_bridge'],
        },
      }
    );

    const result = await provider.getStockSnapshot('600519.SH');

    expect(result.currentPrice).toBe(1490);
  });

  it('falls back from SEC composite to Yahoo for EPS history', async () => {
    const provider = createFallbackGrahamDataProvider(
      [
        namedProvider('sec_edgar', {
          getAdjustedEpsHistory: async () => {
            throw new Error('SEC company facts unavailable');
          },
        }),
        namedProvider('yahoo', {
          getAdjustedEpsHistory: async () => epsRows,
        }),
      ],
      {
        ...baseConfig,
        priorities: {
          ...baseConfig.priorities,
          eps_history: ['sec_edgar', 'yahoo'],
        },
      }
    );

    const result = await provider.getAdjustedEpsHistory('AAPL', 2022, 2023);

    expect(result).toEqual(epsRows);
  });

  it('throws an aggregated error when all providers fail for a data type', async () => {
    const provider = createFallbackGrahamDataProvider(
      [
        namedProvider('eastmoney', {
          getBvpsHistory: async () => {
            throw new Error('eastmoney finance api down');
          },
        }),
      ],
      baseConfig
    );

    await expect(provider.getBvpsHistory('600519.SH', 2022, 2023)).rejects.toThrow(
      'All Graham providers failed for bvps_history 600519.SH'
    );
  });

  it('uses mock fallback when enabled and all live providers fail', async () => {
    const provider = createFallbackGrahamDataProvider(
      [
        namedProvider('eastmoney', {
          getLatestRoe: async () => {
            throw new Error('eastmoney roe down');
          },
        }),
      ],
      { ...baseConfig, enableMockFallback: true }
    );

    const result = await provider.getLatestRoe('600519.SH');

    expect(result.roe).toBeGreaterThan(0);
  });

  it('retries transient provider failure before falling back', async () => {
    let attempts = 0;
    const provider = createFallbackGrahamDataProvider(
      [
        namedProvider('eastmoney', {
          getStockSnapshot: async () => {
            attempts += 1;
            if (attempts < 2) throw new Error('timeout of 8000ms exceeded');
            return snapshot;
          },
        }),
        namedProvider('daily_bars_bridge', {
          getStockSnapshot: async () => ({ ...snapshot, currentPrice: 1400 }),
        }),
      ],
      baseConfig
    );

    const result = await provider.getStockSnapshot('600519.SH');
    expect(result.currentPrice).toBe(1500);
    expect(attempts).toBe(2);
  });

  it('does not retry non-transient errors before falling back', async () => {
    let attempts = 0;
    const provider = createFallbackGrahamDataProvider(
      [
        namedProvider('eastmoney', {
          getStockSnapshot: async () => {
            attempts += 1;
            throw new Error('缺少 2019 年扣非 EPS 数据');
          },
        }),
        namedProvider('daily_bars_bridge', {
          getStockSnapshot: async () => ({ ...snapshot, currentPrice: 1400 }),
        }),
      ],
      baseConfig
    );

    const result = await provider.getStockSnapshot('600519.SH');
    expect(result.currentPrice).toBe(1400);
    expect(attempts).toBe(1);
  });
  it('falls back to next provider after transient error retries are exhausted', async () => {
    let attempts = 0;
    const provider = createFallbackGrahamDataProvider(
      [
        namedProvider('eastmoney', {
          getStockSnapshot: async () => {
            attempts += 1;
            throw new Error('timeout of 8000ms exceeded');
          },
        }),
        namedProvider('daily_bars_bridge', {
          getStockSnapshot: async () => ({ ...snapshot, currentPrice: 1400 }),
        }),
      ],
      baseConfig
    );

    const result = await provider.getStockSnapshot('600519.SH');
    expect(result.currentPrice).toBe(1400);
    // 1 initial try + 2 retries = 3 attempts before fallback
    expect(attempts).toBe(3);
  });
});
