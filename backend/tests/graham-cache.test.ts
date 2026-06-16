import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cacheGrahamBvpsHistory,
  cacheGrahamEpsHistory,
  cacheGrahamRoe,
  cacheGrahamSnapshot,
} from '../src/services/graham/grahamDataCache';
import { CachingGrahamDataProvider } from '../src/services/graham/cachingGrahamDataProvider';
import {
  GrahamBvpsRecord,
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

const bvpsHistory: GrahamBvpsRecord[] = [
  { year: 2020, bvps: 8 },
  { year: 2021, bvps: 8.5 },
  { year: 2022, bvps: 9.2 },
];

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

  it('caches snapshots separately per dataSourceOverride', async () => {
    const eastmoneyFetch = vi.fn().mockResolvedValueOnce({ ...snapshot, dataSource: 'eastmoney' });
    const sinaFetch = vi.fn().mockResolvedValueOnce({ ...snapshot, currentPrice: 99, dataSource: 'sina' });

    await cacheGrahamSnapshot('cn', '600519.SH', eastmoneyFetch, { dataSourceOverride: 'eastmoney' });
    const sinaSnapshot = await cacheGrahamSnapshot('cn', '600519.SH', sinaFetch, {
      dataSourceOverride: 'sina',
    });

    expect(sinaSnapshot.currentPrice).toBe(99);
    expect(eastmoneyFetch).toHaveBeenCalledTimes(1);
    expect(sinaFetch).toHaveBeenCalledTimes(1);
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

  it('treats missing and empty dataSourceOverride as the same cache entry', async () => {
    const fetchFresh = vi.fn().mockResolvedValueOnce({ ...snapshot, stockCode: '600519.SH' });

    await cacheGrahamSnapshot('cn', '600519.SH', fetchFresh);
    await cacheGrahamSnapshot('cn', '600519.SH', fetchFresh, { dataSourceOverride: '' });

    expect(fetchFresh).toHaveBeenCalledTimes(1);
  });

  it('refetches snapshot for same override when forceRefresh is true', async () => {
    const fetchFresh = vi.fn()
      .mockResolvedValueOnce({ ...snapshot, stockCode: '600519.SH', currentPrice: 100, dataSource: 'sina' })
      .mockResolvedValueOnce({ ...snapshot, stockCode: '600519.SH', currentPrice: 200, dataSource: 'sina' });

    await cacheGrahamSnapshot('cn', '600519.SH', fetchFresh, {
      dataSourceOverride: 'sina',
      ttlMs: 60_000,
    });
    const refreshed = await cacheGrahamSnapshot('cn', '600519.SH', fetchFresh, {
      dataSourceOverride: 'sina',
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

  it('permanently caches BVPS history and does not refetch on second call', async () => {
    const fetchFresh = vi.fn().mockResolvedValueOnce(bvpsHistory);

    const first = await cacheGrahamBvpsHistory('us', 'AAPL', fetchFresh);
    const second = await cacheGrahamBvpsHistory('us', 'AAPL', fetchFresh);

    expect(first).toEqual(bvpsHistory);
    expect(second).toEqual(bvpsHistory);
    expect(fetchFresh).toHaveBeenCalledTimes(1);
  });
});

function countingProvider(): GrahamStockDataProvider & {
  counts: { snapshot: number; eps: number; bvps: number; roe: number };
} {
  const counts = { snapshot: 0, eps: 0, bvps: 0, roe: 0 };
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
    async getBvpsHistory(stockCode, startYear, endYear) {
      counts.bvps += 1;
      const rows = [
        { year: 2020, bvps: 8 },
        { year: 2021, bvps: 8.5 },
        { year: 2022, bvps: 9.2 },
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
    await provider.getBvpsHistory('AAPL', 2020, 2022);
    await provider.getLatestRoe('AAPL');
    await provider.getStockSnapshot('AAPL');

    const refreshProvider = new CachingGrahamDataProvider(inner, 'us', {
      refreshPolicy: 'fresh-prices',
      snapshotTtlMs: 60_000,
    });
    await refreshProvider.getAdjustedEpsHistory('AAPL', 2020, 2022);
    await refreshProvider.getBvpsHistory('AAPL', 2020, 2022);
    await refreshProvider.getLatestRoe('AAPL');
    await refreshProvider.getStockSnapshot('AAPL');

    expect(inner.counts.eps).toBe(1);
    expect(inner.counts.bvps).toBe(1);
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
