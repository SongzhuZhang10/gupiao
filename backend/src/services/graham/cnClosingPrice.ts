import { createFallbackManager } from '../providers/fallbackManager';
import { createProviders } from '../providers/adapters';
import { getProviderConfig } from '../providers/config';
import { ProviderResult, DailyBarRecord } from '../providers/types';

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

export type DailyBarsFetcher = (
  symbol: string,
  startDate: string,
  endDate: string
) => Promise<ProviderResult<DailyBarRecord>>;

export function defaultCnDailyBarsFetcher(dataSourceOverride?: string): DailyBarsFetcher {
  return (symbol, startDate, endDate) => {
    const config = { ...getProviderConfig('cn') };
    if (dataSourceOverride) {
      config.priorities = {
        ...config.priorities,
        daily_bars: [dataSourceOverride as any],
        dividend_events: [dataSourceOverride as any],
      };
    }
    return createFallbackManager(createProviders('cn'), config).getDailyBars(
      symbol,
      startDate,
      endDate
    );
  };
}

import { resolveValidClosingPrice } from './closingPriceRules';

/**
 * Resolves the latest closing price via the multi-provider daily-bars pipeline
 * (baostock → eastmoney push2his → akshare → tushare → sina → sohu).
 * This path survives VPN/proxy issues better than a single push2his HTTP call.
 */
export async function fetchLatestCloseFromDailyBars(
  stockCode: string,
  getDailyBars: DailyBarsFetcher = defaultCnDailyBarsFetcher(),
  lookbackDays = 30
): Promise<{ close: number; tradeDate: string; logicalSource: string }> {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = shiftDate(endDate, -lookbackDays);
  const result = await getDailyBars(stockCode, startDate, endDate);
  const sorted = [...result.data].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const latest = resolveValidClosingPrice(sorted, bar => bar.trade_date);
  if (!latest || !Number.isFinite(latest.close) || latest.close <= 0) {
    throw new Error('日线行情数据不可用');
  }
  return {
    close: latest.close,
    tradeDate: latest.trade_date,
    logicalSource: result.sourceMetadata.logical_source,
  };
}
