import { MarketRegion } from '../../utils/stock';
import { getProviderConfig } from '../providers/config';

export function grahamProviderTimeoutMs(market: MarketRegion): number {
  const configured = getProviderConfig(market).timeoutMs;
  if (market === 'us') return Math.max(configured, 15000);
  return Math.max(configured, 8000);
}
