import axios from 'axios';
import { grahamProviderTimeoutMs } from './providerTimeout';

export const NASDAQ_API_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Origin: 'https://www.nasdaq.com',
  Referer: 'https://www.nasdaq.com/',
};

interface NasdaqQuoteData {
  symbol?: string;
  companyName?: string;
  primaryData?: {
    lastSalePrice?: string;
    lastTradeTimestamp?: string;
    isRealTime?: boolean;
  };
  secondaryData?: {
    lastSalePrice?: string;
    lastTradeTimestamp?: string;
    isRealTime?: boolean;
  };
}

export function parseNasdaqPrice(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace(/[$,]/g, '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseNasdaqClosedTradeDate(timestamp: string | undefined): string | undefined {
  if (!timestamp || !timestamp.includes('Closed at')) return undefined;
  const match = timestamp.match(/Closed at\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
  if (!match) return undefined;
  const parsed = new Date(`${match[1]} 12:00:00 GMT`);
  if (!Number.isFinite(parsed.getTime())) return undefined;
  return parsed.toISOString().split('T')[0];
}

export function pickNasdaqClosingQuote(data: NasdaqQuoteData): {
  stockName: string;
  currentPrice: number;
  priceAsOfDate: string;
} {
  const closedPrice = parseNasdaqPrice(data.secondaryData?.lastSalePrice);
  const closedDate = parseNasdaqClosedTradeDate(data.secondaryData?.lastTradeTimestamp);
  if (closedPrice !== undefined && closedDate) {
    return {
      stockName: String(data.companyName ?? data.symbol ?? ''),
      currentPrice: closedPrice,
      priceAsOfDate: closedDate,
    };
  }

  const livePrice =
    parseNasdaqPrice(data.primaryData?.lastSalePrice) ??
    parseNasdaqPrice(data.secondaryData?.lastSalePrice);
  if (livePrice === undefined) {
    throw new Error('Nasdaq 行情价格不可用');
  }

  const liveDate =
    parseNasdaqClosedTradeDate(data.primaryData?.lastTradeTimestamp) ??
    parseNasdaqClosedTradeDate(data.secondaryData?.lastTradeTimestamp) ??
    new Date().toISOString().split('T')[0];

  return {
    stockName: String(data.companyName ?? data.symbol ?? ''),
    currentPrice: livePrice,
    priceAsOfDate: liveDate,
  };
}

export async function fetchNasdaqStockSnapshot(stockCode: string): Promise<{
  stockName: string;
  currentPrice: number;
  priceAsOfDate: string;
}> {
  const symbol = stockCode.toUpperCase();
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=stocks`;
  const res = await axios.get(url, {
    timeout: grahamProviderTimeoutMs('us'),
    headers: NASDAQ_API_HEADERS,
    validateStatus: status => status < 500,
  });
  if (res.status !== 200 || !res.data?.data) {
    throw new Error(`Nasdaq 行情请求失败 (${res.status})`);
  }
  return pickNasdaqClosingQuote(res.data.data as NasdaqQuoteData);
}
