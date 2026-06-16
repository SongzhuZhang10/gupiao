import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateGrahamInputs } from '../src/services/graham/evaluateGraham';
import { CachingGrahamDataProvider } from '../src/services/graham/cachingGrahamDataProvider';
import * as createGrahamModule from '../src/services/graham/createGrahamDataProvider';
import { GrahamStockDataProvider, MockGrahamDataProvider } from '../src/services/grahamDataProvider';
import { setupIsolatedCacheDir, teardownIsolatedCacheDir } from './isolatedCacheDir';

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

describe('evaluateGrahamInputs', () => {
  it('returns ERROR row without throwing when EPS years are missing', async () => {
    const sparseProvider: GrahamStockDataProvider = {
      getStockSnapshot: async stockCode => ({
        stockCode,
        stockName: 'Sparse Co',
        currentPrice: 10,
        priceAsOfDate: '2026-06-10',
      }),
      getAdjustedEpsHistory: async () => [{ year: 2024, adjustedEps: 2 }],
      getBvpsHistory: async () => [{ year: 2024, bvps: 20 }],
      getLatestRoe: async () => ({ year: 2024, roe: 12 }),
    };

    const rows = await evaluateGrahamInputs(
      [{ stockCode: 'AAPL', startYear: 2018, endYear: 2019, Y: 1.71, market: 'us' }],
      () => sparseProvider
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('ERROR');
    expect(rows[0].message).toContain('可用年份');
  });

  it('returns OK row for valid mock US evaluation', async () => {
    const rows = await evaluateGrahamInputs(
      [{ stockCode: 'AAPL', startYear: 2020, endYear: 2022, Y: 1.71, market: 'us' }],
      () => new MockGrahamDataProvider()
    );

    expect(rows[0].status).toBe('OK');
    expect(rows[0].grahamPrice).toBeGreaterThan(0);
    expect(rows[0].bvps).toBeGreaterThan(0);
  });

  it('produces identical R and grahamPrice for cn and us when provider data matches', async () => {
    const sharedProvider: GrahamStockDataProvider = {
      getStockSnapshot: async stockCode => ({
        stockCode,
        stockName: 'Shared Co',
        currentPrice: 100,
        priceAsOfDate: '2026-06-10',
      }),
      getAdjustedEpsHistory: async (_code, startYear, endYear) => {
        const history = [
          { year: 2020, adjustedEps: 1.0 },
          { year: 2021, adjustedEps: 1.1 },
          { year: 2022, adjustedEps: 1.21 },
        ];
        return history.filter(row => row.year >= startYear && row.year <= endYear);
      },
      getBvpsHistory: async (_code, startYear, endYear) => {
        const history = [
          { year: 2020, bvps: 12 },
          { year: 2021, bvps: 12.5 },
          { year: 2022, bvps: 13.1 },
        ];
        return history.filter(row => row.year >= startYear && row.year <= endYear);
      },
      getLatestRoe: async () => {
        throw new Error('ROE 暂不可用');
      },
    };

    const input = { stockCode: 'TEST', startYear: 2020, endYear: 2022, Y: 1.71 };
    const cnRows = await evaluateGrahamInputs(
      [{ ...input, stockCode: '600519.SH', market: 'cn' }],
      () => sharedProvider
    );
    const usRows = await evaluateGrahamInputs(
      [{ ...input, stockCode: 'AAPL', market: 'us' }],
      () => sharedProvider
    );

    expect(cnRows[0].R).toBe(usRows[0].R);
    expect(cnRows[0].grahamPrice).toBe(usRows[0].grahamPrice);
    expect(cnRows[0].startEPS).toBe(usRows[0].startEPS);
    expect(cnRows[0].endEPS).toBe(usRows[0].endEPS);
    expect(cnRows[0].status).toBe('WARNING');
    expect(usRows[0].status).toBe('WARNING');
    expect(cnRows[0].message).toBe('ROE 暂不可用');
    expect(cnRows[0].bvps).toBe(13.1);
  });

  it('returns grahamPriceR0 instead of grahamPriceR7', async () => {
    const rows = await evaluateGrahamInputs(
      [{ stockCode: 'AAPL', startYear: 2020, endYear: 2022, Y: 1.71, market: 'us' }],
      () => new MockGrahamDataProvider()
    );
    expect(rows[0].grahamPriceR0).toBeGreaterThan(0);
    expect(rows[0]).not.toHaveProperty('grahamPriceR7');
  });

  it('respects custom rGrowthCoeff in evaluation', async () => {
    const defaultRows = await evaluateGrahamInputs(
      [{ stockCode: 'AAPL', startYear: 2020, endYear: 2022, Y: 1.71, market: 'us' }],
      () => new MockGrahamDataProvider()
    );
    const customRows = await evaluateGrahamInputs(
      [{ stockCode: 'AAPL', startYear: 2020, endYear: 2022, Y: 1.71, rGrowthCoeff: 3, market: 'us' }],
      () => new MockGrahamDataProvider()
    );
    expect(customRows[0].grahamPrice).toBeGreaterThan(defaultRows[0].grahamPrice!);
  });

  describe('cache integration', () => {
    beforeEach(setupIsolatedCacheDir);

    afterEach(async () => {
      vi.restoreAllMocks();
      await teardownIsolatedCacheDir();
    });

    it('fresh-prices policy refetches snapshot but not EPS/ROE on second evaluate call', async () => {
      const inner = countingProvider();
      vi.spyOn(createGrahamModule, 'createGrahamDataProvider').mockImplementation((market, cacheContext) => {
        if (!cacheContext) return inner;
        return new CachingGrahamDataProvider(inner, market, cacheContext);
      });

      const input = { stockCode: 'AAPL', startYear: 2020, endYear: 2022, Y: 1.71, market: 'us' as const };

      await evaluateGrahamInputs([input], undefined, { refreshPolicy: 'default' });
      expect(inner.counts).toEqual({ snapshot: 1, eps: 1, bvps: 1, roe: 1 });

      await evaluateGrahamInputs([input], undefined, { refreshPolicy: 'fresh-prices' });
      expect(inner.counts.eps).toBe(1);
      expect(inner.counts.bvps).toBe(1);
      expect(inner.counts.roe).toBe(1);
      expect(inner.counts.snapshot).toBe(2);
    });
  });

  it('clamps start/end years to available EPS and returns WARNING', async () => {
    const provider: GrahamStockDataProvider = {
      getStockSnapshot: async stockCode => ({
        stockCode,
        stockName: 'New Listing Co',
        currentPrice: 20,
        priceAsOfDate: '2026-06-10',
      }),
      getAdjustedEpsHistory: async (_code, startYear, endYear) => {
        const rows = [
          { year: 2022, adjustedEps: 1.0 },
          { year: 2023, adjustedEps: 1.2 },
          { year: 2024, adjustedEps: 1.4 },
        ];
        return rows.filter(r => r.year >= startYear && r.year <= endYear);
      },
      getBvpsHistory: async (_code, startYear, endYear) => {
        const rows = [
          { year: 2022, bvps: 8 },
          { year: 2023, bvps: 8.5 },
          { year: 2024, bvps: 9 },
        ];
        return rows.filter(r => r.year >= startYear && r.year <= endYear);
      },
      getLatestRoe: async () => ({ year: 2024, roe: 12 }),
    };

    const rows = await evaluateGrahamInputs(
      [{ stockCode: '301000.SZ', startYear: 2019, endYear: 2024, Y: 1.71, market: 'cn' }],
      () => provider
    );

    expect(rows[0].status).toBe('WARNING');
    expect(rows[0].startEPS).toBe(1.0);
    expect(rows[0].endEPS).toBe(1.4);
    expect(rows[0].message).toContain('起始年已从 2019 调整为');
  });
});
