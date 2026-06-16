import axios from 'axios';
import { fetchNasdaqStockSnapshot } from './nasdaqMarketApi';
import { grahamProviderTimeoutMs } from './providerTimeout';

function isLiveDisabledInTest(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.ALLOW_LIVE_PROVIDER_TESTS !== 'true';
}

function unixToDate(unix: number): string {
  return new Date(unix * 1000).toISOString().split('T')[0];
}

function extractLastYahooDailyClose(result: {
  timestamp?: number[];
  indicators?: { quote?: Array<{ close?: Array<number | null> }> };
}): { close: number; tradeDate: string } {
  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  for (let i = closes.length - 1; i >= 0; i -= 1) {
    const close = Number(closes[i]);
    if (Number.isFinite(close) && close > 0) {
      const ts = timestamps[i];
      return {
        close,
        tradeDate: Number.isFinite(ts) ? unixToDate(ts) : new Date().toISOString().split('T')[0],
      };
    }
  }
  throw new Error('Yahoo 日线收盘价不可用');
}

async function fetchYahooStockSnapshot(stockCode: string): Promise<{
  stockName: string;
  currentPrice: number;
  priceAsOfDate: string;
}> {
  if (isLiveDisabledInTest()) {
    throw new Error('yahoo graham provider disabled in test environment');
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(stockCode)}?interval=1d&range=1mo`;
  const res = await axios.get(url, {
    timeout: grahamProviderTimeoutMs('us'),
    headers: { 'User-Agent': 'Mozilla/5.0' },
    validateStatus: status => status < 500,
  });
  if (res.status === 403 || res.status === 429) {
    throw new Error(`Yahoo 行情被阻断 (${res.status})`);
  }
  const result = res.data?.chart?.result?.[0];
  const meta = result?.meta;
  if (!result || !meta) throw new Error('Yahoo 行情数据不可用');

  const { close, tradeDate } = extractLastYahooDailyClose(result);
  return {
    stockName: String(meta.shortName ?? stockCode),
    currentPrice: close,
    priceAsOfDate: tradeDate,
  };
}

export async function fetchUsMarketSnapshot(stockCode: string): Promise<{
  stockName: string;
  currentPrice: number;
  priceAsOfDate: string;
  dataSource: 'yahoo' | 'nasdaq';
  qualityFlags: string[];
}> {
  try {
    const snapshot = await fetchYahooStockSnapshot(stockCode);
    return { ...snapshot, dataSource: 'yahoo', qualityFlags: [] };
  } catch (yahooError) {
    const snapshot = await fetchNasdaqStockSnapshot(stockCode);
    const reason = yahooError instanceof Error ? yahooError.message : String(yahooError);
    return {
      ...snapshot,
      dataSource: 'nasdaq',
      qualityFlags: ['yahoo_blocked_nasdaq_fallback', reason],
    };
  }
}
