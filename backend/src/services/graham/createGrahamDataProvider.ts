import { MarketRegion } from '../../utils/stock';
import { GrahamStockDataProvider } from '../grahamDataProvider';
import { CachingGrahamDataProvider, GrahamCacheContext } from './cachingGrahamDataProvider';
import { createCnDailyBarsSnapshotGrahamProvider } from './cnDailyBarsSnapshotGrahamProvider';
import { EastMoneyGrahamDataProvider } from './eastMoneyGrahamProvider';
import { createFallbackGrahamDataProvider } from './grahamFallbackManager';
import { getGrahamProviderConfig } from './grahamProviderConfig';
import { NamedGrahamProvider } from './grahamProviderTypes';
import { UsGrahamDataProvider } from './usGrahamDataProvider';
import { YahooGrahamDataProvider } from './yahooGrahamProvider';

function wrapNamed(
  name: NamedGrahamProvider['name'],
  accessLayer: string,
  provider: GrahamStockDataProvider
): NamedGrahamProvider {
  return {
    name,
    accessLayer,
    getStockSnapshot: stockCode => provider.getStockSnapshot(stockCode),
    getAdjustedEpsHistory: (stockCode, startYear, endYear) =>
      provider.getAdjustedEpsHistory(stockCode, startYear, endYear),
    getBvpsHistory: (stockCode, startYear, endYear) =>
      provider.getBvpsHistory(stockCode, startYear, endYear),
    getLatestRoe: stockCode => provider.getLatestRoe(stockCode),
  };
}

export function createGrahamProviders(market: MarketRegion, override?: string): NamedGrahamProvider[] {
  if (market === 'us') {
    return [
      wrapNamed('sec_edgar', 'sec_edgar+yahoo', new UsGrahamDataProvider()),
      wrapNamed('yahoo', 'yahoo_finance', new YahooGrahamDataProvider()),
    ];
  }
  const providers: NamedGrahamProvider[] = [];
  providers.push(
    wrapNamed('eastmoney', 'eastmoney_f10', new EastMoneyGrahamDataProvider()),
    createCnDailyBarsSnapshotGrahamProvider(override)
  );
  return providers;
}

export function createInnerGrahamDataProvider(market: MarketRegion, override?: string): GrahamStockDataProvider {
  const providers = createGrahamProviders(market, override);
  let config = getGrahamProviderConfig(market);
  if (override) {
    config = {
      ...config,
      priorities: {
        ...config.priorities,
        snapshot: market === 'cn' ? (override === 'eastmoney' ? ['eastmoney'] : ['daily_bars_bridge']) : [override as any],
      },
    };
  }
  return createFallbackGrahamDataProvider(providers, config);
}

export function createGrahamDataProvider(
  market: MarketRegion,
  cacheContext?: GrahamCacheContext,
  override?: string
): GrahamStockDataProvider {
  const inner = createInnerGrahamDataProvider(market, override);
  if (!cacheContext) return inner;
  return new CachingGrahamDataProvider(inner, market, {
    ...cacheContext,
    dataSourceOverride: override,
  });
}
