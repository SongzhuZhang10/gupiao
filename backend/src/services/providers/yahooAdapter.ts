import axios from 'axios';
import {
  DailyBarRecord,
  DataProvider,
  DividendEventRecord,
  ProviderName,
  SourceMetadata,
} from './types';
import { normalizeDailyBars } from './validation';
import { getProviderConfig } from './config';
import { MarketRegion } from '../../utils/stock';

function isLiveDisabledInTest(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.ALLOW_LIVE_PROVIDER_TESTS !== 'true';
}

function metadata(
  logicalSource: ProviderName,
  accessLayer: string,
  symbol: string,
  rank: number,
  fallbackUsed: boolean,
  rawFieldMap: Record<string, string>,
  qualityFlags: string[] = []
): SourceMetadata {
  return {
    logical_source: logicalSource,
    access_layer: accessLayer,
    retrieved_at: new Date().toISOString(),
    symbol,
    market: 'US',
    source_priority_rank: rank,
    fallback_used: fallbackUsed,
    raw_field_map: rawFieldMap,
    quality_flags: qualityFlags,
  };
}

function dateToUnix(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00.000Z`).getTime() / 1000);
}

function unixToDate(unix: number): string {
  return new Date(unix * 1000).toISOString().split('T')[0];
}

function calculateVendorYield(
  tradeDateStr: string,
  closePrice: number,
  events: DividendEventRecord[],
  dividendMode = 'dv_ttm'
): number | undefined {
  const tradeDate = new Date(tradeDateStr);
  let sum = 0;

  if (dividendMode === 'dv_ttm') {
    const oneYearAgo = new Date(tradeDate);
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);
    for (const event of events) {
      const eventDate = new Date(event.ex_date ?? event.record_date ?? event.announcement_date ?? '');
      if (eventDate <= tradeDate && eventDate > oneYearAgo) sum += event.cash_dividend ?? 0;
    }
  } else {
    const targetYear = tradeDate.getFullYear() - 1;
    for (const event of events) {
      const eventDate = new Date(event.ex_date ?? event.record_date ?? event.announcement_date ?? '');
      if (eventDate.getFullYear() === targetYear && eventDate <= tradeDate) sum += event.cash_dividend ?? 0;
    }
  }

  return closePrice > 0 ? Number(((sum / closePrice) * 100).toFixed(4)) : undefined;
}

async function fetchYahooChart(symbol: string, startDate: string, endDate: string) {
  if (isLiveDisabledInTest()) throw new Error('yahoo live provider disabled in test environment');
  const period1 = dateToUnix(startDate);
  const period2 = dateToUnix(endDate) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=div`;
  const res = await axios.get(url, {
    timeout: getProviderConfig('us' as MarketRegion).timeoutMs,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const result = res.data?.chart?.result?.[0];
  if (!result) throw new Error('Yahoo chart missing result');
  return result;
}

function dividendEventsFromChart(
  symbol: string,
  chart: Record<string, any>,
  rank: number,
  fallbackUsed: boolean
): DividendEventRecord[] {
  const dividends = chart.events?.dividends ?? {};
  return Object.values(dividends).map((item: any) => ({
    symbol,
    ex_date: unixToDate(item.date),
    cash_dividend: Number(item.amount),
    dividend_description: `Cash dividend ${item.amount}`,
    source_reference: symbol,
    metadata: metadata('yahoo', 'yahoo_finance_chart_v8', symbol, rank, fallbackUsed, {
      cash_dividend: 'amount',
      ex_date: 'date',
    }),
  }));
}

export function createYahooProvider(): DataProvider {
  return {
    name: 'yahoo',
    accessLayer: 'yahoo_finance_chart_v8',
    getDailyBars: async (symbol, startDate, endDate, _adjust, rank = 1, fallbackUsed = false) => {
      const chart = await fetchYahooChart(symbol, startDate, endDate);
      const timestamps: number[] = chart.timestamp ?? [];
      const quote = chart.indicators?.quote?.[0] ?? {};
      const opens: (number | null)[] = quote.open ?? [];
      const highs: (number | null)[] = quote.high ?? [];
      const lows: (number | null)[] = quote.low ?? [];
      const closes: (number | null)[] = quote.close ?? [];
      const volumes: (number | null)[] = quote.volume ?? [];
      const dividendEvents = dividendEventsFromChart(symbol, chart, rank, fallbackUsed);

      const rows = timestamps
        .map((ts, index) => {
          const close = closes[index];
          if (close == null) return null;
          const tradeDate = unixToDate(ts);
          const vendorYield = calculateVendorYield(tradeDate, close, dividendEvents);
          return {
            date: tradeDate,
            o: opens[index],
            h: highs[index],
            l: lows[index],
            c: close,
            v: volumes[index],
            dy: vendorYield,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      return normalizeDailyBars(rows, {
        logicalSource: 'yahoo',
        accessLayer: 'yahoo_finance_chart_v8',
        symbol,
        rank,
        fallbackUsed,
        rawFieldMap: {
          trade_date: 'date',
          open: 'o',
          high: 'h',
          low: 'l',
          close: 'c',
          volume: 'v',
          vendor_dividend_yield: 'dy',
        },
      });
    },
    getDividendEvents: async (symbol, startDate, endDate, rank = 1, fallbackUsed = false) => {
      const upperDate = endDate ?? new Date().toISOString().slice(0, 10);
      const chart = await fetchYahooChart(symbol, startDate ?? '1970-01-01', upperDate);
      return dividendEventsFromChart(symbol, chart, rank, fallbackUsed).filter(event => {
        if (startDate && event.ex_date && event.ex_date < startDate) return false;
        if (endDate && event.ex_date && event.ex_date > endDate) return false;
        return true;
      });
    },
  };
}
