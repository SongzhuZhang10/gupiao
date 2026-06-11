import { MarketRegion } from '../../utils/stock';
import {
  GrahamEpsRecord,
  GrahamRoeRecord,
  GrahamStockDataProvider,
  GrahamStockSnapshot,
} from '../grahamDataProvider';
import {
  cacheGrahamEpsHistory,
  cacheGrahamRoe,
  cacheGrahamSnapshot,
} from './grahamDataCache';

export type GrahamRefreshPolicy = 'default' | 'fresh-prices';

export interface GrahamCacheContext {
  refreshPolicy: GrahamRefreshPolicy;
  snapshotTtlMs: number;
}

const EPS_FETCH_START_YEAR = 1990;

export class CachingGrahamDataProvider implements GrahamStockDataProvider {
  constructor(
    private readonly inner: GrahamStockDataProvider,
    private readonly market: MarketRegion,
    private readonly cacheContext: GrahamCacheContext
  ) {}

  async getStockSnapshot(stockCode: string): Promise<GrahamStockSnapshot> {
    return cacheGrahamSnapshot(
      this.market,
      stockCode,
      () => this.inner.getStockSnapshot(stockCode),
      {
        ttlMs: this.cacheContext.snapshotTtlMs,
        forceRefresh: this.cacheContext.refreshPolicy === 'fresh-prices',
      }
    );
  }

  async getAdjustedEpsHistory(
    stockCode: string,
    startYear: number,
    endYear: number
  ): Promise<GrahamEpsRecord[]> {
    const fetchEndYear = new Date().getFullYear();
    const fullHistory = await cacheGrahamEpsHistory(this.market, stockCode, () =>
      this.inner.getAdjustedEpsHistory(stockCode, EPS_FETCH_START_YEAR, fetchEndYear)
    );
    return fullHistory.filter(row => row.year >= startYear && row.year <= endYear);
  }

  async getLatestRoe(stockCode: string): Promise<GrahamRoeRecord> {
    return cacheGrahamRoe(this.market, stockCode, () => this.inner.getLatestRoe(stockCode));
  }
}
