import axios from 'axios';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EastMoneyGrahamDataProvider } from '../src/services/graham/eastMoneyGrahamProvider';
import { UsGrahamDataProvider } from '../src/services/graham/usGrahamDataProvider';
import { YahooGrahamDataProvider } from '../src/services/graham/yahooGrahamProvider';
import { resetSecEdgarCachesForTest } from '../src/services/graham/secEdgarClient';
import {
  createGrahamDataProvider,
  createGrahamProviders,
} from '../src/services/graham/createGrahamDataProvider';
import * as cnClosingPrice from '../src/services/graham/cnClosingPrice';
import { FallbackGrahamDataProvider } from '../src/services/graham/grahamFallbackManager';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

const eastMoneyAnnualFixture = {
  success: true,
  result: {
    data: [
      {
        SECUCODE: '600519.SH',
        SECURITY_NAME_ABBR: '贵州茅台',
        REPORT_YEAR: '2023',
        REPORT_DATE_NAME: '2023年报',
        EPSKCJB: 59.51,
        ROEKCJQ: 34.2,
        BPS: 185.56,
      },
      {
        SECUCODE: '600519.SH',
        SECURITY_NAME_ABBR: '贵州茅台',
        REPORT_YEAR: '2022',
        REPORT_DATE_NAME: '2022年报',
        EPSKCJB: 49.99,
        ROEKCJQ: 30.29,
        BPS: 170.12,
      },
    ],
  },
};

const eastMoneyKlineFixture = {
  data: {
    name: '贵州茅台',
    klines: ['2026-06-11,1270,1279,1288,1265,12345,987654'],
  },
};

const eastMoneyQuoteFixture = {
  data: {
    f57: '600519',
    f58: '贵州茅台',
    f43: 150000,
  },
} as const;

const yahooChartFixture = {
  chart: {
    result: [
      {
        meta: {
          shortName: 'Apple Inc.',
          regularMarketPrice: 190.5,
          regularMarketTime: 1700000000,
        },
      },
    ],
  },
};

const yahooNvdaChartFixture = {
  chart: {
    result: [
      {
        meta: {
          shortName: 'NVIDIA Corporation',
          regularMarketPrice: 200.42,
          regularMarketTime: 1700000000,
        },
        timestamp: [1700000000, 1700086400],
        indicators: {
          quote: [{ close: [195.1, 198.75] }],
        },
      },
    ],
  },
};

const yahooEpsFixture = {
  timeseries: {
    result: [
      {
        annualDilutedEPS: [
          { asOfDate: '2022-09-30', reportedValue: { raw: 6.11 } },
          { asOfDate: '2023-09-30', reportedValue: { raw: 6.13 } },
        ],
      },
    ],
  },
};

const secTickerFixture = {
  '0': { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' },
};

const secNvdaCompanyFacts = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/secNvdaCompanyFacts.json'), 'utf8')
);

describe('Graham real data providers', () => {
  beforeEach(() => {
    vi.stubEnv('ALLOW_LIVE_PROVIDER_TESTS', 'true');
    resetSecEdgarCachesForTest();
  });

  afterEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetSecEdgarCachesForTest();
  });

  it('createGrahamDataProvider wraps market-specific providers with fallback', () => {
    expect(createGrahamDataProvider('cn')).toBeInstanceOf(FallbackGrahamDataProvider);
    expect(createGrahamDataProvider('us')).toBeInstanceOf(FallbackGrahamDataProvider);
    expect(createGrahamProviders('cn').map(provider => provider.name)).toEqual([
      'eastmoney',
      'daily_bars_bridge',
    ]);
    expect(createGrahamProviders('us').map(provider => provider.name)).toEqual(['sec_edgar', 'yahoo']);
  });



  it('EastMoneyGrahamDataProvider falls back to daily bars when push2his fails', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('ECONNRESET'));
    vi.spyOn(cnClosingPrice, 'fetchLatestCloseFromDailyBars').mockResolvedValue({
      close: 1490,
      tradeDate: '2026-06-10',
      logicalSource: 'baostock',
    });

    const provider = new EastMoneyGrahamDataProvider();
    const snapshot = await provider.getStockSnapshot('600519.SH');

    expect(snapshot.currentPrice).toBe(1490);
    expect(snapshot.priceAsOfDate).toBe('2026-06-10');
    expect(snapshot.dataSource).toBe('eastmoney');
    expect(cnClosingPrice.fetchLatestCloseFromDailyBars).toHaveBeenCalledWith('600519.SH');
  });

  it('EastMoneyGrahamDataProvider falls back to push2delay quote when kline hosts fail', async () => {
    vi.mocked(axios.get).mockImplementation(async (url: string) => {
      if (url.includes('/api/qt/stock/kline/get')) {
        throw new Error('socket hang up');
      }
      if (url.includes('push2delay.eastmoney.com/api/qt/stock/get')) {
        return { data: eastMoneyQuoteFixture };
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const fetchBars = vi.spyOn(cnClosingPrice, 'fetchLatestCloseFromDailyBars');

    const provider = new EastMoneyGrahamDataProvider();
    const snapshot = await provider.getStockSnapshot('600519.SH');

    expect(snapshot.stockName).toBe('贵州茅台');
    expect(snapshot.currentPrice).toBe(1500);
    expect(snapshot.dataSource).toBe('eastmoney');
    expect(fetchBars).not.toHaveBeenCalled();
    expect(vi.mocked(axios.get).mock.calls.some(call => String(call[0]).includes('push2delay.eastmoney.com'))).toBe(
      true
    );
  });

  it('EastMoneyGrahamDataProvider uses push2his kline close as snapshot price', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: eastMoneyKlineFixture,
    });
    vi.spyOn(cnClosingPrice, 'fetchLatestCloseFromDailyBars').mockRejectedValue(
      new Error('daily bars unavailable')
    );

    const provider = new EastMoneyGrahamDataProvider();
    const snapshot = await provider.getStockSnapshot('600519.SH');

    expect(snapshot.stockName).toBe('贵州茅台');
    expect(snapshot.currentPrice).toBe(1279);
    expect(snapshot.priceAsOfDate).toBe('2026-06-11');
    expect(vi.mocked(axios.get)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(axios.get).mock.calls[0][0]).toContain('push2his.eastmoney.com');
  });

  it('EastMoneyGrahamDataProvider maps annual 扣非 EPS and ROE', async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: eastMoneyKlineFixture })
      .mockResolvedValueOnce({ data: eastMoneyAnnualFixture })
      .mockResolvedValueOnce({ data: eastMoneyAnnualFixture })
      .mockResolvedValueOnce({ data: eastMoneyAnnualFixture })
      .mockResolvedValueOnce({ data: eastMoneyAnnualFixture });

    const provider = new EastMoneyGrahamDataProvider();
    const snapshot = await provider.getStockSnapshot('600519.SH');
    expect(snapshot.stockName).toBe('贵州茅台');
    expect(snapshot.currentPrice).toBe(1279);

    const eps = await provider.getAdjustedEpsHistory('600519.SH', 2022, 2023);
    expect(eps).toEqual([
      { year: 2022, adjustedEps: 49.99 },
      { year: 2023, adjustedEps: 59.51 },
    ]);

    const roe = await provider.getLatestRoe('600519.SH');
    expect(roe.year).toBe(2023);
    expect(roe.roe).toBe(34.2);

    const bvps = await provider.getBvpsHistory('600519.SH', 2022, 2023);
    expect(bvps).toEqual([
      { year: 2022, bvps: 170.12 },
      { year: 2023, bvps: 185.56 },
    ]);
  });

  it('UsGrahamDataProvider maps NVDA SEC 10-K EPS to report-period calendar years', async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: secTickerFixture })
      .mockResolvedValueOnce({ data: secNvdaCompanyFacts });

    const provider = new UsGrahamDataProvider();
    const eps = await provider.getAdjustedEpsHistory('NVDA', 2020, 2025);
    expect(eps.find(row => row.year === 2020)?.adjustedEps).toBe(1.73);
    expect(eps.find(row => row.year === 2023)?.adjustedEps).toBe(1.19);
    expect(eps.find(row => row.year === 2025)?.adjustedEps).toBe(4.9);
  });

  it('UsGrahamDataProvider returns latest ROE from SEC 10-K', async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: secTickerFixture })
      .mockResolvedValueOnce({ data: secNvdaCompanyFacts });

    const provider = new UsGrahamDataProvider();
    const roe = await provider.getLatestRoe('NVDA');
    expect(roe.year).toBeGreaterThanOrEqual(2024);
    expect(roe.roe).toBeGreaterThan(0);
  });

  it('UsGrahamDataProvider uses Yahoo for snapshot and SEC for EPS history', async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: yahooNvdaChartFixture })
      .mockResolvedValueOnce({ data: secTickerFixture })
      .mockResolvedValueOnce({ data: secNvdaCompanyFacts });

    const provider = new UsGrahamDataProvider();
    const snapshot = await provider.getStockSnapshot('NVDA');
    expect(snapshot.stockName).toBe('NVIDIA Corporation');
    expect(snapshot.currentPrice).toBe(198.75);

    const eps = await provider.getAdjustedEpsHistory('NVDA', 2023, 2025);
    expect(eps.map(row => row.year)).toEqual([2023, 2024, 2025]);

    const bvps = await provider.getBvpsHistory('NVDA', 2023, 2024);
    expect(bvps.find(row => row.year === 2023)?.bvps).toBe(17.47);
  });

  it('YahooGrahamDataProvider uses last daily close instead of regularMarketPrice', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: yahooNvdaChartFixture });

    const provider = new YahooGrahamDataProvider();
    const snapshot = await provider.getStockSnapshot('NVDA');

    expect(snapshot.currentPrice).toBe(198.75);
    expect(snapshot.priceAsOfDate).toBe('2023-11-15');
    expect(vi.mocked(axios.get).mock.calls[0][0]).toContain('range=1mo');
  });

  it('YahooGrahamDataProvider still maps Apple EPS when used directly', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: yahooEpsFixture });

    const provider = new YahooGrahamDataProvider();
    const eps = await provider.getAdjustedEpsHistory('AAPL', 2022, 2023);
    expect(eps).toEqual([
      { year: 2022, adjustedEps: 6.11 },
      { year: 2023, adjustedEps: 6.13 },
    ]);
  });
});
