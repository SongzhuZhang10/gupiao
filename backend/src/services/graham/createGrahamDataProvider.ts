import { MarketRegion } from '../../utils/stock';
import { GrahamStockDataProvider } from '../grahamDataProvider';
import { CachingGrahamDataProvider, GrahamCacheContext } from './cachingGrahamDataProvider';
import { EastMoneyGrahamDataProvider } from './eastMoneyGrahamProvider';
import { UsGrahamDataProvider } from './usGrahamDataProvider';

export function createInnerGrahamDataProvider(market: MarketRegion): GrahamStockDataProvider {
  if (market === 'us') return new UsGrahamDataProvider();
  return new EastMoneyGrahamDataProvider();
}

export function createGrahamDataProvider(
  market: MarketRegion,
  cacheContext?: GrahamCacheContext
): GrahamStockDataProvider {
  const inner = createInnerGrahamDataProvider(market);
  if (!cacheContext) return inner;
  return new CachingGrahamDataProvider(inner, market, cacheContext);
}
