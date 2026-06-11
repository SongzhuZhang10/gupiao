import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import {
  cacheGrahamEpsHistory,
  cacheGrahamRoe,
  cacheGrahamSnapshot,
} from '../src/services/graham/grahamDataCache';
import { GrahamEpsRecord, GrahamRoeRecord, GrahamStockSnapshot } from '../src/services/grahamDataProvider';

const testCacheDir = path.resolve(__dirname, '../cache');

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

describe('grahamDataCache', () => {
  beforeEach(async () => {
    process.env.GUPAO_CACHE_DIR = testCacheDir;
    await fs.rm(testCacheDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    delete process.env.GUPAO_CACHE_DIR;
    await fs.rm(testCacheDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

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
