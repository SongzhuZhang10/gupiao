import axios from 'axios';
import { getMockData } from '../../mocks/mockData';
import { MarketRegion } from '../../utils/stock';
import {
  DailyBarRecord,
  DataProvider,
  DividendEventRecord,
  ProviderName,
  SourceMetadata,
} from './types';
import { normalizeDailyBars } from './validation';
import { runPythonProvider } from './pythonBridge';
import { getProviderConfig, getProviderTimeoutMs } from './config';
import { createYahooProvider } from './yahooAdapter';
import { eastMoneySecId } from '../../utils/eastMoneySecId';
import { buildEastMoneyKlineUrl, EASTMONEY_KLINE_HOSTS } from '../graham/eastMoneyMarketApi';

function isLiveDisabledInTest(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.ALLOW_LIVE_PROVIDER_TESTS !== 'true';
}

function pureCode(symbol: string): string {
  return symbol.replace(/\.(SH|SZ)$/i, '');
}

function market(symbol: string): string {
  if (symbol.endsWith('.SH')) return 'SH';
  if (symbol.endsWith('.SZ')) return 'SZ';
  return 'UNKNOWN';
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
    market: market(symbol),
    source_priority_rank: rank,
    fallback_used: fallbackUsed,
    raw_field_map: rawFieldMap,
    quality_flags: qualityFlags,
  };
}

export async function fetchEastMoneyDividends(symbol: string, rank = 2, fallbackUsed = true): Promise<DividendEventRecord[]> {
  if (isLiveDisabledInTest()) throw new Error('eastmoney live dividend provider disabled in test environment');
  const code = pureCode(symbol);
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_SHAREBONUS_DET&columns=ALL&quoteColumns=&filter=(SECURITY_CODE%3D%22${code}%22)&pageNumber=1&pageSize=500&sortTypes=-1&sortColumns=EX_DIVIDEND_DATE&source=WEB&client=WEB`;
  const res = await axios.get(url, { timeout: getProviderTimeoutMs('eastmoney') });
  const rows = res.data?.result?.data;
  if (!Array.isArray(rows)) return [];

  return rows
    .filter((item: any) => item.PRETAX_BONUS_RMB !== undefined && (item.EX_DIVIDEND_DATE || item.NOTICE_DATE))
    .map((item: any) => ({
      symbol,
      ex_date: item.EX_DIVIDEND_DATE?.split(' ')[0],
      announcement_date: item.NOTICE_DATE?.split(' ')[0],
      record_date: item.RECORD_DATE?.split(' ')[0],
      cash_dividend: Number((Number(item.PRETAX_BONUS_RMB) / 10).toFixed(4)),
      dividend_description: item.IMPL_PLAN_PROFILE,
      source_reference: item.SECURITY_CODE,
      metadata: metadata(
        'eastmoney',
        'eastmoney_datacenter_sharebonus',
        symbol,
        rank,
        fallbackUsed,
        {
          cash_dividend: 'PRETAX_BONUS_RMB/10',
          ex_date: 'EX_DIVIDEND_DATE',
          announcement_date: 'NOTICE_DATE',
          record_date: 'RECORD_DATE',
        }
      ),
    }));
}

function mapBridgeDividendRows(
  symbol: string,
  rows: Record<string, unknown>[],
  logicalSource: ProviderName,
  accessLayer: string,
  rank: number,
  fallbackUsed: boolean
): DividendEventRecord[] {
  return rows.map(row => ({
    symbol,
    ex_date: String(row.ex_date ?? ''),
    announcement_date: String(row.announcement_date ?? ''),
    record_date: String(row.record_date ?? ''),
    cash_dividend: Number(row.cash_dividend),
    dividend_description: String(row.dividend_description ?? ''),
    source_reference: String(row.source_reference ?? logicalSource),
    metadata: metadata(logicalSource, accessLayer, symbol, rank, fallbackUsed, {}),
  }));
}

function calculateVendorYield(tradeDateStr: string, closePrice: number, events: DividendEventRecord[], dividendMode = 'dv_ttm'): number | undefined {
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

async function fetchSinaDailyBars(
  symbol: string,
  startDate: string,
  endDate: string,
  rank: number,
  fallbackUsed: boolean,
  qualityFlags: string[] = [],
  logicalSourceOverride?: ProviderName
): Promise<DailyBarRecord[]> {
  if (isLiveDisabledInTest()) throw new Error('sina live daily provider disabled in test environment');
  const sinaSymbol = `${symbol.toUpperCase().endsWith('.SH') ? 'sh' : 'sz'}${pureCode(symbol)}`;
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${sinaSymbol}&scale=240&ma=no&datalen=5000`;
  const res = await axios.get(url, {
    timeout: getProviderTimeoutMs('sina'),
    headers: { Referer: 'http://finance.sina.com.cn/' },
  });
  if (!Array.isArray(res.data)) throw new Error('Sina API failed');
  return normalizeDailyBars(
    res.data
      .filter((d: { day: string }) => d.day >= startDate && d.day <= endDate)
      .map((d: { day: string; open: string; high: string; low: string; close: string; volume: string; amount: string }) => ({
        date: d.day,
        o: d.open,
        h: d.high,
        l: d.low,
        c: d.close,
        v: d.volume,
        a: d.amount,
      })),
    {
      logicalSource: logicalSourceOverride ?? 'sina',
      accessLayer: 'sina_kline_json',
      symbol,
      rank,
      fallbackUsed,
      rawFieldMap: { trade_date: 'date', open: 'o', high: 'h', low: 'l', close: 'c', volume: 'v', amount: 'a' },
      qualityFlags,
    }
  );
}

async function fetchBridgeDailyBarsWithSinaFallback(
  provider: 'baostock' | 'tushare' | 'akshare_generic' | 'cninfo',
  accessLayer: string,
  symbol: string,
  startDate: string,
  endDate: string,
  rank: number,
  fallbackUsed: boolean,
  qualityFlags: string[] = []
): Promise<DailyBarRecord[]> {
  const rawFieldMap = {
    trade_date: 'date',
    open: 'open',
    high: 'high',
    low: 'low',
    close: 'close',
    volume: 'volume',
    amount: 'amount',
  };
  try {
    const rows = await runPythonProvider<Record<string, unknown>[]>(
      provider,
      'daily_bars',
      { symbol, startDate, endDate },
      getProviderTimeoutMs(provider)
    );
    return normalizeDailyBars(rows, {
      logicalSource: provider,
      accessLayer,
      symbol,
      rank,
      fallbackUsed,
      rawFieldMap,
      qualityFlags,
    });
  } catch {
    return fetchSinaDailyBars(symbol, startDate, endDate, rank, true, [...qualityFlags, 'bridge_fallback_sina'], provider);
  }
}

function createMockProvider(): DataProvider {
  return {
    name: 'mock',
    accessLayer: 'local_mock_data',
    getDailyBars: async (symbol, startDate, endDate, _adjust, rank = 999, fallbackUsed = true) => {
      const mockData = getMockData(symbol).filter(d => d.trade_date >= startDate && d.trade_date <= endDate);
      const rows = mockData.length > 0 ? mockData : getMockData(symbol);
      return rows.map(d => ({
        trade_date: d.trade_date,
        open: d.close ?? 0,
        high: d.close ?? 0,
        low: d.close ?? 0,
        close: d.close ?? 0,
        volume: 1,
        amount: d.close ?? 0,
        adj_factor: d.adj_factor,
        dividend_yield: d.dividend_yield,
        metadata: metadata('mock', 'local_mock_data', symbol, rank, fallbackUsed, {}, ['mock_data']),
      }));
    },
  };
}

function createCnProviders(): DataProvider[] {
  return [
    {
      name: 'baostock',
      accessLayer: 'python_bridge_baostock',
      getDailyBars: async (symbol, startDate, endDate, _adjust, rank = 1, fallbackUsed = false) =>
        fetchBridgeDailyBarsWithSinaFallback(
          'baostock',
          'python_bridge_baostock',
          symbol,
          startDate,
          endDate,
          rank,
          fallbackUsed
        ),
    },
    {
      name: 'cninfo',
      accessLayer: 'python_bridge_akshare_cninfo',
      getDailyBars: async (symbol, startDate, endDate, _adjust, rank = 1, fallbackUsed = false) =>
        fetchBridgeDailyBarsWithSinaFallback(
          'cninfo',
          'python_bridge_akshare_cninfo',
          symbol,
          startDate,
          endDate,
          rank,
          fallbackUsed,
          ['sina_daily_fallback']
        ),
      getDividendEvents: async (symbol, startDate, endDate, rank = 1, fallbackUsed = false) => {
        const rows = await runPythonProvider<Record<string, unknown>[]>('cninfo', 'dividend_events', { symbol, startDate, endDate }, getProviderTimeoutMs('cninfo'));
        return mapBridgeDividendRows(symbol, rows, 'cninfo', 'python_bridge_akshare_cninfo', rank, fallbackUsed);
      },
    },
    {
      name: 'eastmoney',
      accessLayer: 'eastmoney_public_http',
      getDailyBars: async (symbol, startDate, endDate, _adjust, rank = 2, fallbackUsed = true) => {
        if (isLiveDisabledInTest()) throw new Error('eastmoney live daily provider disabled in test environment');
        const beg = startDate.replace(/-/g, '');
        const end = endDate.replace(/-/g, '');
        const secid = eastMoneySecId(symbol);
        let klines: string[] | undefined;
        let lastError: unknown;
        for (const host of EASTMONEY_KLINE_HOSTS) {
          try {
            const url = buildEastMoneyKlineUrl(host, secid, { beg, end });
            const res = await axios.get(url, {
              timeout: getProviderTimeoutMs('eastmoney'),
              headers: { 'User-Agent': 'Mozilla/5.0' },
            });
            const rows = res.data?.data?.klines;
            if (Array.isArray(rows) && rows.length > 0) {
              klines = rows;
              break;
            }
            lastError = new Error('Eastmoney missing klines data');
          } catch (error) {
            lastError = error;
          }
        }
        if (!klines) {
          try {
            return await fetchSinaDailyBars(symbol, startDate, endDate, rank, true, ['kline_fallback_sina'], 'eastmoney');
          } catch {
            throw lastError instanceof Error ? lastError : new Error('Eastmoney missing klines data');
          }
        }
        let events: DividendEventRecord[] = [];
        try {
          events = await fetchEastMoneyDividends(symbol, rank, fallbackUsed);
        } catch {
          events = [];
        }
        return klines.map((item: string) => {
          const parts = item.split(',');
          const close = Number(parts[2]);
          const vendorYield = calculateVendorYield(parts[0], close, events);
          const row = normalizeDailyBars(
            [{ date: parts[0], o: parts[1], c: parts[2], h: parts[3], l: parts[4], v: parts[5], a: parts[6], dy: vendorYield }],
            {
              logicalSource: 'eastmoney',
              accessLayer: 'eastmoney_push2his',
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
                amount: 'a',
                vendor_dividend_yield: 'dy',
              },
            }
          )[0];
          return row;
        });
      },
      getDividendEvents: async (symbol, _startDate, _endDate, rank = 2, fallbackUsed = true) => fetchEastMoneyDividends(symbol, rank, fallbackUsed),
    },
    {
      name: 'akshare_generic',
      accessLayer: 'python_bridge_akshare',
      getDailyBars: async (symbol, startDate, endDate, _adjust, rank = 3, fallbackUsed = true) =>
        fetchBridgeDailyBarsWithSinaFallback(
          'akshare_generic',
          'python_bridge_akshare',
          symbol,
          startDate,
          endDate,
          rank,
          fallbackUsed
        ),
      getDividendEvents: async (symbol, startDate, endDate, rank = 3, fallbackUsed = true) => {
        const rows = await runPythonProvider<Record<string, unknown>[]>('akshare_generic', 'dividend_events', { symbol, startDate, endDate }, getProviderTimeoutMs('akshare_generic'));
        return mapBridgeDividendRows(symbol, rows, 'akshare_generic', 'python_bridge_akshare', rank, fallbackUsed);
      },
    },
    {
      name: 'tushare',
      accessLayer: 'python_bridge_tushare',
      getDailyBars: async (symbol, startDate, endDate, _adjust, rank = 4, fallbackUsed = true) =>
        fetchBridgeDailyBarsWithSinaFallback(
          'tushare',
          'python_bridge_tushare',
          symbol,
          startDate,
          endDate,
          rank,
          fallbackUsed
        ),
      getDividendEvents: async (symbol, startDate, endDate, rank = 4, fallbackUsed = true) => {
        const rows = await runPythonProvider<Record<string, unknown>[]>('tushare', 'dividend_events', { symbol, startDate, endDate }, getProviderTimeoutMs('tushare'));
        return mapBridgeDividendRows(symbol, rows, 'tushare', 'python_bridge_tushare', rank, fallbackUsed);
      },
    },
    {
      name: 'sina',
      accessLayer: 'sina_public_http',
      getDailyBars: async (symbol, startDate, endDate, _adjust, rank = 5, fallbackUsed = true) =>
        fetchSinaDailyBars(symbol, startDate, endDate, rank, fallbackUsed),
    },
    {
      name: 'sohu',
      accessLayer: 'sohu_public_http',
      getDailyBars: async (symbol, startDate, endDate, _adjust, rank = 6, fallbackUsed = true) => {
        if (isLiveDisabledInTest()) throw new Error('sohu live daily provider disabled in test environment');
        const sohuCode = `cn_${pureCode(symbol)}`;
        const start = startDate.replace(/-/g, '');
        const end = endDate.replace(/-/g, '');
        const url = `https://q.stock.sohu.com/hisHq?code=${sohuCode}&start=${start}&end=${end}&stat=1&order=D&period=d&rt=json`;
        const res = await axios.get(url, { timeout: getProviderTimeoutMs('sohu') });
        const hq = res.data?.[0]?.hq;
        if (!Array.isArray(hq)) throw new Error('Sohu API failed');
        const rows = hq.map((item: any[]) => ({ date: item[0], o: item[1], c: item[2], l: item[5], h: item[6], v: item[7], a: item[8] }));
        return normalizeDailyBars(rows, {
          logicalSource: 'sohu',
          accessLayer: 'sohu_hisHq',
          symbol,
          rank,
          fallbackUsed,
          rawFieldMap: { trade_date: 'date', open: 'o', high: 'h', low: 'l', close: 'c', volume: 'v', amount: 'a' },
          qualityFlags: ['low_priority_source'],
        });
      },
    },
    createMockProvider(),
  ];
}

export function createProviders(market: MarketRegion = 'cn'): DataProvider[] {
  if (market === 'us') {
    return [createYahooProvider(), createMockProvider()];
  }
  return createCnProviders();
}
