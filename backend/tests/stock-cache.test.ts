import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import {
  cacheTtlMsFromHours,
  clearStockDataCache,
  DEFAULT_CACHE_TTL_MS,
  withStockCache,
} from '../src/services/stockCache';

const testCacheDir = path.resolve(__dirname, '../cache');

function metadata(logicalSource: 'baostock' | 'cninfo' | 'mock' = 'baostock') {
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

function result(source: 'baostock' | 'cninfo' | 'mock' = 'baostock', warnings: string[] = []) {
  return {
    data: [{ trade_date: '2024-01-02', close: source === 'cninfo' ? 20 : 10, metadata: metadata(source) }],
    dataSource: source,
    warnings,
    sourceMetadata: metadata(source),
  };
}

const baseParams = {
  tsCode: '600519.SH',
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  priceMode: 'forward',
  dividendMode: 'dv_ttm',
};

describe('stock filesystem cache', () => {
  beforeEach(async () => {
    await fs.rm(testCacheDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(testCacheDir, { recursive: true, force: true });
  });

  it('uses 24 hours as the default TTL and parses GUI hours', () => {
    expect(DEFAULT_CACHE_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(cacheTtlMsFromHours(undefined)).toBe(DEFAULT_CACHE_TTL_MS);
    expect(cacheTtlMsFromHours('2')).toBe(2 * 60 * 60 * 1000);
    expect(cacheTtlMsFromHours('0')).toBe(DEFAULT_CACHE_TTL_MS);
  });

  it('writes a real provider result on miss and reuses it for the same key', async () => {
    const fetchFresh = vi.fn()
      .mockResolvedValueOnce(result('baostock'))
      .mockResolvedValueOnce(result('cninfo'));

    const first = await withStockCache({
      dataType: 'history',
      params: baseParams,
      ttlMs: DEFAULT_CACHE_TTL_MS,
      fetchFresh,
    });
    const second = await withStockCache({
      dataType: 'history',
      params: baseParams,
      ttlMs: DEFAULT_CACHE_TTL_MS,
      fetchFresh,
    });

    expect(first.dataSource).toBe('baostock');
    expect(second.dataSource).toBe('baostock');
    expect(fetchFresh).toHaveBeenCalledTimes(1);
  });

  it('does not reuse cache when a key parameter changes', async () => {
    const fetchFresh = vi.fn()
      .mockResolvedValueOnce(result('baostock'))
      .mockResolvedValueOnce(result('cninfo'));

    await withStockCache({
      dataType: 'history',
      params: baseParams,
      ttlMs: DEFAULT_CACHE_TTL_MS,
      fetchFresh,
    });
    const changed = await withStockCache({
      dataType: 'history',
      params: { ...baseParams, priceMode: 'backward' },
      ttlMs: DEFAULT_CACHE_TTL_MS,
      fetchFresh,
    });

    expect(changed.dataSource).toBe('cninfo');
    expect(fetchFresh).toHaveBeenCalledTimes(2);
  });

  it('refetches expired cache and overwrites corrupt cache', async () => {
    const freshAfterExpiry = vi.fn()
      .mockResolvedValueOnce(result('baostock'))
      .mockResolvedValueOnce(result('cninfo'));

    await withStockCache({
      dataType: 'history',
      params: baseParams,
      ttlMs: 1,
      fetchFresh: freshAfterExpiry,
    });
    await new Promise(resolve => setTimeout(resolve, 5));
    const expired = await withStockCache({
      dataType: 'history',
      params: baseParams,
      ttlMs: 1,
      fetchFresh: freshAfterExpiry,
    });

    expect(expired.dataSource).toBe('cninfo');
    expect(freshAfterExpiry).toHaveBeenCalledTimes(2);

    const files = await fs.readdir(testCacheDir);
    await fs.writeFile(path.join(testCacheDir, files[0]), '{not-json', 'utf8');
    const freshAfterCorrupt = vi.fn().mockResolvedValueOnce(result('baostock'));

    const recovered = await withStockCache({
      dataType: 'history',
      params: baseParams,
      ttlMs: DEFAULT_CACHE_TTL_MS,
      fetchFresh: freshAfterCorrupt,
    });

    expect(recovered.dataSource).toBe('baostock');
    expect(freshAfterCorrupt).toHaveBeenCalledTimes(1);
  });

  it('does not cache mock results', async () => {
    const fetchFresh = vi.fn()
      .mockResolvedValueOnce(result('mock'))
      .mockResolvedValueOnce(result('baostock'));

    await withStockCache({
      dataType: 'history',
      params: baseParams,
      ttlMs: DEFAULT_CACHE_TTL_MS,
      fetchFresh,
    });
    const second = await withStockCache({
      dataType: 'history',
      params: baseParams,
      ttlMs: DEFAULT_CACHE_TTL_MS,
      fetchFresh,
    });

    expect(second.dataSource).toBe('baostock');
    expect(fetchFresh).toHaveBeenCalledTimes(2);
  });

  it('returns stale cache with a warning when fresh fetch fails', async () => {
    const fetchFresh = vi.fn()
      .mockResolvedValueOnce(result('baostock'))
      .mockRejectedValueOnce(new Error('provider down'));

    await withStockCache({
      dataType: 'history',
      params: baseParams,
      ttlMs: 1,
      fetchFresh,
    });
    await new Promise(resolve => setTimeout(resolve, 5));
    const stale = await withStockCache({
      dataType: 'history',
      params: baseParams,
      ttlMs: 1,
      fetchFresh,
    });

    expect(stale.dataSource).toBe('baostock');
    expect(stale.warnings).toContain('外部数据源不可用，已返回过期本地缓存。');
  });

  it('logs a warning when cache write fails but returns fresh data', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('disk full'));

    const fresh = await withStockCache({
      dataType: 'history',
      params: baseParams,
      ttlMs: DEFAULT_CACHE_TTL_MS,
      fetchFresh: vi.fn().mockResolvedValueOnce(result('baostock')),
    });

    expect(fresh.dataSource).toBe('baostock');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[StockCache] Failed to write cache'), expect.any(Error));
  });

  it('clears the cache directory and treats a missing directory as success', async () => {
    await fs.mkdir(testCacheDir, { recursive: true });
    await fs.writeFile(path.join(testCacheDir, 'fixture.json'), '{}', 'utf8');

    await expect(clearStockDataCache()).resolves.toBeUndefined();
    await expect(fs.readdir(testCacheDir)).resolves.toEqual([]);
    await fs.rm(testCacheDir, { recursive: true, force: true });
    await expect(clearStockDataCache()).resolves.toBeUndefined();
  });
});
