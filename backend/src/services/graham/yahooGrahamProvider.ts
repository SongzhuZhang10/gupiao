import axios from 'axios';
import {
  GrahamBvpsRecord,
  GrahamEpsRecord,
  GrahamRoeRecord,
  GrahamStockDataProvider,
  GrahamStockSnapshot,
} from '../grahamDataProvider';
import { annualReportYearFromAsOfDate } from '../../utils/annualReportYear';
import { grahamProviderTimeoutMs } from './providerTimeout';
import { fetchUsMarketSnapshot } from './usMarketQuote';

function isLiveDisabledInTest(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.ALLOW_LIVE_PROVIDER_TESTS !== 'true';
}

export class YahooGrahamDataProvider implements GrahamStockDataProvider {
  private async fetchAnnualEpsRows(symbol: string): Promise<Array<{ year: number; adjustedEps: number }>> {
    if (isLiveDisabledInTest()) {
      throw new Error('yahoo graham provider disabled in test environment');
    }
    const period1 = Math.floor(new Date('2000-01-01T00:00:00.000Z').getTime() / 1000);
    const period2 = Math.floor(Date.now() / 1000) + 86400 * 366;
    const url = `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}&period1=${period1}&period2=${period2}&type=annualDilutedEPS`;
    const res = await axios.get(url, {
      timeout: grahamProviderTimeoutMs('us'),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const entries = res.data?.timeseries?.result?.[0]?.annualDilutedEPS;
    if (!Array.isArray(entries)) throw new Error('Yahoo 年度 EPS 数据不可用');
    return entries
      .map((entry: { asOfDate: string; reportedValue?: { raw?: number } }) => ({
        year: annualReportYearFromAsOfDate(entry.asOfDate),
        adjustedEps: Number(entry.reportedValue?.raw),
      }))
      .filter(row => Number.isFinite(row.adjustedEps))
      .sort((a, b) => a.year - b.year);
  }

  private async fetchAnnualBvpsRows(
    symbol: string
  ): Promise<Array<{ year: number; bvps: number }>> {
    if (isLiveDisabledInTest()) {
      throw new Error('yahoo graham provider disabled in test environment');
    }
    const period1 = Math.floor(new Date('2000-01-01T00:00:00.000Z').getTime() / 1000);
    const period2 = Math.floor(Date.now() / 1000) + 86400 * 366;
    const url = `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}&period1=${period1}&period2=${period2}&type=annualCommonStockEquity,annualShareIssued`;
    const res = await axios.get(url, {
      timeout: grahamProviderTimeoutMs('us'),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const result = res.data?.timeseries?.result?.[0];
    const equityEntries = result?.annualCommonStockEquity;
    const shareEntries = result?.annualShareIssued;
    if (!Array.isArray(equityEntries) || !Array.isArray(shareEntries)) {
      throw new Error('Yahoo 年度 BVPS 数据不可用');
    }

    const sharesByDate = new Map(
      shareEntries.map((entry: { asOfDate: string; reportedValue?: { raw?: number } }) => [
        entry.asOfDate,
        Number(entry.reportedValue?.raw),
      ])
    );

    return equityEntries
      .map((entry: { asOfDate: string; reportedValue?: { raw?: number } }) => {
        const equity = Number(entry.reportedValue?.raw);
        const shares = sharesByDate.get(entry.asOfDate);
        if (
          shares === undefined ||
          !Number.isFinite(equity) ||
          !Number.isFinite(shares) ||
          shares <= 0
        ) {
          return null;
        }
        return {
          year: annualReportYearFromAsOfDate(entry.asOfDate),
          bvps: Number((equity / shares).toFixed(2)),
        };
      })
      .filter((row): row is { year: number; bvps: number } => row !== null)
      .sort((a, b) => a.year - b.year);
  }

  async getStockSnapshot(stockCode: string): Promise<GrahamStockSnapshot> {
    if (isLiveDisabledInTest()) {
      throw new Error('yahoo graham provider disabled in test environment');
    }
    const snapshot = await fetchUsMarketSnapshot(stockCode);
    return {
      stockCode,
      stockName: snapshot.stockName,
      currentPrice: snapshot.currentPrice,
      priceAsOfDate: snapshot.priceAsOfDate,
      dataSource: snapshot.dataSource,
    };
  }

  async getAdjustedEpsHistory(
    stockCode: string,
    startYear: number,
    endYear: number
  ): Promise<GrahamEpsRecord[]> {
    const rows = await this.fetchAnnualEpsRows(stockCode);
    return rows.filter(row => row.year >= startYear && row.year <= endYear);
  }

  async getBvpsHistory(
    stockCode: string,
    startYear: number,
    endYear: number
  ): Promise<GrahamBvpsRecord[]> {
    const rows = await this.fetchAnnualBvpsRows(stockCode);
    return rows.filter(row => row.year >= startYear && row.year <= endYear);
  }

  async getLatestRoe(stockCode: string): Promise<GrahamRoeRecord> {
    void stockCode;
    throw new Error('ROE 暂不可用');
  }
}
