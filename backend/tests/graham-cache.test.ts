import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cacheGrahamEpsHistory,
  cacheGrahamRoe,
  cacheGrahamSnapshot,
} from '../src/services/graham/grahamDataCache';
import { CachingGrahamDataProvider } from '../src/services/graham/cachingGrahamDataProvider';
import {
  GrahamEpsRecord,
  GrahamRoeRecord,
  GrahamStockDataProvider,
  GrahamStockSnapshot,
} from '../src/services/grahamDataProvider';
import { setupIsolatedCacheDir, teardownIsolatedCacheDir } from './isolatedCacheDir';

const snapshot: GrahamStockSnapshot = {
  stockCode: 'AAPL',
  stockName: 'Apple',
  currentPrice: 190,
  priceAsOfDate: '2026-06-11',
};

const epsHistory: GrahamEpsRecord[] = [
  { year: 2020, adjustedEps: 1.0 },
  { year: 2021, adjustedEps: 1.1 },
  { year: 2022, adjustedEps: 1.21 },
];

const roe: GrahamRoeRecord = { year: 2022, roe: 15.5 };

beforeEach(setupIsolatedCacheDir);

afterEach(async () => {
  vi.restoreAllMocks();
  await teardownIsolatedCacheDir();
});

describe('grahamDataCache', () => {

  it('permanently caches EPS history and does not refetch on second call', async () => {
    const fetchFresh = vi.fn().mockResolvedValueOnce(epsHistory);

    const first = await cacheGrahamEpsHistory('us', 'AAPL', fetchFresh);
    const second = await cacheGrahamEpsHistory('us', 'AAPL', fetchFresh);

    expect(first).toEqual(epsHistory);
    expect(second).toEqual(epsHistory);
    expect(fetchFresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes snapshot when forceRefresh is true', async () => {
    const fetchFresh = vi.fn()
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce({ ...snapshot, currentPrice: 200 });

    await cacheGrahamSnapshot('us', 'AAPL', fetchFresh, { ttlMs: 60_000 });
    const refreshed = await cacheGrahamSnapshot('us', 'AAPL', fetchFresh, {
      ttlMs: 60_000,
      forceRefresh: true,
    });

    expect(refreshed.currentPrice).toBe(200);
    expect(fetchFresh).toHaveBeenCalledTimes(2);
  });

  it('permanently caches ROE', async () => {
    const fetchFresh = vi.fn().mockResolvedValueOnce(roe);

    await cacheGrahamRoe('us', 'AAPL', fetchFresh);
    const second = await cacheGrahamRoe('us', 'AAPL', fetchFresh);

    expect(second).toEqual(roe);
    expect(fetchFresh).toHaveBeenCalledTimes(1);
  });
});

function countingProvider(): GrahamStockDataProvider & {
  counts: { snapshot: number; eps: number; roe: number };
} {
  const counts = { snapshot: 0, eps: 0, roe: 0 };
  return {
    counts,
    async getStockSnapshot(stockCode) {
      counts.snapshot += 1;
      return { stockCode, stockName: 'Test', currentPrice: 10, priceAsOfDate: '2026-06-11' };
    },
    async getAdjustedEpsHistory(stockCode, startYear, endYear) {
      counts.eps += 1;
      const rows = [
        { year: 2020, adjustedEps: 1 },
        { year: 2021, adjustedEps: 1.1 },
        { year: 2022, adjustedEps: 1.21 },
      ];
      return rows.filter(r => r.year >= startYear && r.year <= endYear);
    },
    async getLatestRoe() {
      counts.roe += 1;
      return { year: 2022, roe: 12 };
    },
  };
}

describe('CachingGrahamDataProvider', () => {
  it('caches EPS and ROE but refetches snapshot on fresh-prices policy', async () => {
    const inner = countingProvider();
    const provider = new CachingGrahamDataProvider(inner, 'us', {
      refreshPolicy: 'default',
      snapshotTtlMs: 60_000,
    });

    await provider.getAdjustedEpsHistory('AAPL', 2020, 2022);
    await provider.getLatestRoe('AAPL');
    await provider.getStockSnapshot('AAPL');

    const refreshProvider = new CachingGrahamDataProvider(inner, 'us', {
      refreshPolicy: 'fresh-prices',
      snapshotTtlMs: 60_000,
    });
    await refreshProvider.getAdjustedEpsHistory('AAPL', 2020, 2022);
    await refreshProvider.getLatestRoe('AAPL');
    await refreshProvider.getStockSnapshot('AAPL');

    expect(inner.counts.eps).toBe(1);
    expect(inner.counts.roe).toBe(1);
    expect(inner.counts.snapshot).toBe(2);
  });

  it('fetches full EPS history for cache then filters requested years', async () => {
    const inner = countingProvider();
    const provider = new CachingGrahamDataProvider(inner, 'us', {
      refreshPolicy: 'default',
      snapshotTtlMs: 60_000,
    });

    const first = await provider.getAdjustedEpsHistory('AAPL', 2020, 2021);
    const second = await provider.getAdjustedEpsHistory('AAPL', 2020, 2022);

    expect(first.map(r => r.year)).toEqual([2020, 2021]);
    expect(second.map(r => r.year)).toEqual([2020, 2021, 2022]);
    expect(inner.counts.eps).toBe(1);
  });
});
