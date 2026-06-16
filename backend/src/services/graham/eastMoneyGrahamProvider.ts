import axios from 'axios';
import {
  GrahamBvpsRecord,
  GrahamEpsRecord,
  GrahamRoeRecord,
  GrahamStockDataProvider,
  GrahamStockSnapshot,
} from '../grahamDataProvider';
import { annualReportYearFromAsOfDate } from '../../utils/annualReportYear';
import { fetchLatestCloseFromDailyBars } from './cnClosingPrice';
import { getProviderTimeoutMs } from '../providers/config';
import { grahamProviderTimeoutMs } from './providerTimeout';
import { eastMoneySecId, eastMoneySecuCode } from '../../utils/eastMoneySecId';

function isLiveDisabledInTest(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.ALLOW_LIVE_PROVIDER_TESTS !== 'true';
}

function annualRows(data: Record<string, unknown>[]) {
  return data.filter(row => String(row.REPORT_DATE_NAME ?? '').includes('年报'));
}

function yearFromReportRow(row: Record<string, unknown>): number {
  const reportYear = Number(row.REPORT_YEAR);
  if (Number.isInteger(reportYear)) return reportYear;
  const reportDate = String(row.REPORT_DATE ?? '');
  if (reportDate.length >= 10) {
    return annualReportYearFromAsOfDate(reportDate.slice(0, 10));
  }
  return Number(reportDate.slice(0, 4));
}

const EASTMONEY_HTTP_HEADERS = { 'User-Agent': 'Mozilla/5.0' };

async function getEastMoneyJson<T>(url: string, attempts = 2, timeoutMs = grahamProviderTimeoutMs('cn')): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await axios.get<T>(url, {
        timeout: timeoutMs,
        headers: EASTMONEY_HTTP_HEADERS,
      });
      return res.data;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export class EastMoneyGrahamDataProvider implements GrahamStockDataProvider {
  private async fetchAnnualRows(symbol: string): Promise<Record<string, unknown>[]> {
    if (isLiveDisabledInTest()) {
      throw new Error('eastmoney graham provider disabled in test environment');
    }
    const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_F10_FINANCE_MAINFINADATA&columns=SECUCODE,SECURITY_NAME_ABBR,REPORT_DATE,REPORT_YEAR,REPORT_DATE_NAME,EPSKCJB,ROEKCJQ,BPS&filter=(SECUCODE%3D%22${encodeURIComponent(eastMoneySecuCode(symbol))}%22)&pageNumber=1&pageSize=200&sortTypes=-1&sortColumns=REPORT_DATE`;
    const res = await getEastMoneyJson<{ result?: { data?: Record<string, unknown>[] } }>(url);
    const rows = res.result?.data;
    if (!Array.isArray(rows)) throw new Error('EastMoney 财务指标数据不可用');
    return annualRows(rows);
  }

  private async fetchSnapshotFromKline(stockCode: string): Promise<GrahamStockSnapshot> {
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${eastMoneySecId(stockCode)}&klt=101&fqt=0&end=20500101&lmt=1&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;
    const res = await getEastMoneyJson<{ data?: { name?: string; klines?: string[] } }>(url, 1, getProviderTimeoutMs('eastmoney'));
    const latest = res.data?.klines?.[res.data.klines.length - 1];
    if (!latest) throw new Error('EastMoney 日线行情数据不可用');
    const parts = latest.split(',');
    const close = Number(parts[2]);
    if (!Number.isFinite(close) || close <= 0) throw new Error('EastMoney 日线行情数据不可用');
    return {
      stockCode,
      stockName: String(res.data?.name ?? stockCode),
      currentPrice: close,
      priceAsOfDate: parts[0] || new Date().toISOString().split('T')[0],
    };
  }

  private async fetchSnapshotFromDailyBars(stockCode: string): Promise<GrahamStockSnapshot> {
    const { close, tradeDate, logicalSource } = await fetchLatestCloseFromDailyBars(stockCode);
    let stockName = stockCode;
    try {
      const rows = await this.fetchAnnualRows(stockCode);
      const name = rows[0]?.SECURITY_NAME_ABBR;
      if (typeof name === 'string' && name.trim()) stockName = name.trim();
    } catch {
      // name lookup is best-effort; price from daily bars is authoritative
    }
    return {
      stockCode,
      stockName,
      currentPrice: close,
      priceAsOfDate: tradeDate,
      dataSource: logicalSource,
    };
  }

  async getStockSnapshot(stockCode: string): Promise<GrahamStockSnapshot> {
    if (isLiveDisabledInTest()) {
      throw new Error('eastmoney graham provider disabled in test environment');
    }

    return new Promise<GrahamStockSnapshot>((resolve, reject) => {
      let settled = false;
      let pending = 2;
      let klineError: unknown;
      let barsError: unknown;

      const finish = (snapshot: GrahamStockSnapshot) => {
        if (settled) return;
        settled = true;
        resolve(snapshot);
      };

      const onSettled = () => {
        pending -= 1;
        if (settled || pending > 0) return;
        const error = klineError ?? barsError ?? new Error('EastMoney 行情数据不可用');
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      void this.fetchSnapshotFromKline(stockCode)
        .then(finish)
        .catch(error => {
          klineError = error;
        })
        .finally(onSettled);

      void this.fetchSnapshotFromDailyBars(stockCode)
        .then(finish)
        .catch(error => {
          barsError = error;
        })
        .finally(onSettled);
    });
  }

  async getAdjustedEpsHistory(
    stockCode: string,
    startYear: number,
    endYear: number
  ): Promise<GrahamEpsRecord[]> {
    const rows = await this.fetchAnnualRows(stockCode);
    return rows
      .map(row => ({
        year: yearFromReportRow(row),
        adjustedEps: Number(row.EPSKCJB),
      }))
      .filter(row => row.year >= startYear && row.year <= endYear && Number.isFinite(row.adjustedEps))
      .sort((a, b) => a.year - b.year);
  }

  async getBvpsHistory(
    stockCode: string,
    startYear: number,
    endYear: number
  ): Promise<GrahamBvpsRecord[]> {
    const rows = await this.fetchAnnualRows(stockCode);
    return rows
      .map(row => ({
        year: yearFromReportRow(row),
        bvps: Number(row.BPS),
      }))
      .filter(row => row.year >= startYear && row.year <= endYear && Number.isFinite(row.bvps))
      .sort((a, b) => a.year - b.year);
  }

  async getLatestRoe(stockCode: string): Promise<GrahamRoeRecord> {
    const rows = await this.fetchAnnualRows(stockCode);
    if (rows.length === 0) throw new Error('缺少 ROE 数据');
    const latest = rows[0];
    return {
      year: yearFromReportRow(latest),
      roe: Number(latest.ROEKCJQ),
    };
  }
}
