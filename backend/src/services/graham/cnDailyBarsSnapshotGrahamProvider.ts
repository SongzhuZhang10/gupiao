import axios from 'axios';
import { DailyBarRecord, ProviderResult } from '../providers/types';
import { GrahamStockDataProvider, GrahamStockSnapshot } from '../grahamDataProvider';
import {
  DailyBarsFetcher,
  defaultCnDailyBarsFetcher,
  fetchLatestCloseFromDailyBars,
} from './cnClosingPrice';
import { NamedGrahamProvider } from './grahamProviderTypes';
import { grahamProviderTimeoutMs } from './providerTimeout';

async function resolveCnStockName(stockCode: string): Promise<string | undefined> {
  try {
    const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_F10_FINANCE_MAINFINADATA&columns=SECUCODE,SECURITY_NAME_ABBR&filter=(SECUCODE%3D%22${encodeURIComponent(stockCode)}%22)&pageNumber=1&pageSize=1&sortTypes=-1&sortColumns=REPORT_DATE`;
    const res = await axios.get(url, {
      timeout: grahamProviderTimeoutMs('cn'),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const name = res.data?.result?.data?.[0]?.SECURITY_NAME_ABBR;
    return typeof name === 'string' && name.trim() ? name.trim() : undefined;
  } catch {
    return undefined;
  }
}

export class CnDailyBarsSnapshotGrahamProvider implements GrahamStockDataProvider {
  constructor(
    private readonly getDailyBars: DailyBarsFetcher = defaultCnDailyBarsFetcher(),
    private readonly resolveStockName: (stockCode: string) => Promise<string | undefined> = resolveCnStockName
  ) {}

  async getStockSnapshot(stockCode: string): Promise<GrahamStockSnapshot> {
    const { close, tradeDate, logicalSource } = await fetchLatestCloseFromDailyBars(stockCode, this.getDailyBars);
    const stockName = (await this.resolveStockName(stockCode)) ?? stockCode;
    return {
      stockCode,
      stockName,
      currentPrice: close,
      priceAsOfDate: tradeDate,
      dataSource: logicalSource,
    };
  }

  async getAdjustedEpsHistory(_stockCode: string, _startYear: number, _endYear: number): Promise<never> {
    throw new Error('日线桥接源不提供 EPS 数据');
  }

  async getBvpsHistory(_stockCode: string, _startYear: number, _endYear: number): Promise<never> {
    throw new Error('日线桥接源不提供 BVPS 数据');
  }

  async getLatestRoe(_stockCode: string): Promise<never> {
    throw new Error('日线桥接源不提供 ROE 数据');
  }
}

export function createCnDailyBarsSnapshotGrahamProvider(override?: string): NamedGrahamProvider {
  const provider = new CnDailyBarsSnapshotGrahamProvider(defaultCnDailyBarsFetcher(override));
  return {
    name: 'daily_bars_bridge',
    accessLayer: 'provider_fallback_daily_bars',
    getStockSnapshot: stockCode => provider.getStockSnapshot(stockCode),
    getAdjustedEpsHistory: (stockCode, startYear, endYear) =>
      provider.getAdjustedEpsHistory(stockCode, startYear, endYear),
    getBvpsHistory: (stockCode, startYear, endYear) =>
      provider.getBvpsHistory(stockCode, startYear, endYear),
    getLatestRoe: stockCode => provider.getLatestRoe(stockCode),
  };
}
