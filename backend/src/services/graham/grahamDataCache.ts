import { MarketRegion } from '../../utils/stock';
import { DEFAULT_CACHE_TTL_MS, withDataCache } from '../stockCache';
import {
  GrahamEpsRecord,
  GrahamRoeRecord,
  GrahamStockSnapshot,
} from '../grahamDataProvider';

interface GrahamCacheOptions {
  ttlMs?: number;
  forceRefresh?: boolean;
}

function cacheParams(market: MarketRegion, stockCode: string) {
  return { market, stockCode: stockCode.toUpperCase() };
}

export async function cacheGrahamEpsHistory(
  market: MarketRegion,
  stockCode: string,
  fetchFresh: () => Promise<GrahamEpsRecord[]>
): Promise<GrahamEpsRecord[]> {
  return withDataCache({
    dataType: 'graham-eps-history',
    params: cacheParams(market, stockCode),
    permanent: true,
    fetchFresh,
  });
}

export async function cacheGrahamRoe(
  market: MarketRegion,
  stockCode: string,
  fetchFresh: () => Promise<GrahamRoeRecord>
): Promise<GrahamRoeRecord> {
  return withDataCache({
    dataType: 'graham-roe',
    params: cacheParams(market, stockCode),
    permanent: true,
    fetchFresh,
  });
}

export async function cacheGrahamSnapshot(
  market: MarketRegion,
  stockCode: string,
  fetchFresh: () => Promise<GrahamStockSnapshot>,
  options: GrahamCacheOptions = {}
): Promise<GrahamStockSnapshot> {
  return withDataCache({
    dataType: 'graham-snapshot',
    params: cacheParams(market, stockCode),
    ttlMs: options.ttlMs ?? DEFAULT_CACHE_TTL_MS,
    forceRefresh: options.forceRefresh ?? false,
    fetchFresh,
  });
}
