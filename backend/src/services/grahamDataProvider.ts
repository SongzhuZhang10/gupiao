export interface GrahamStockSnapshot {
  stockCode: string;
  stockName: string;
  currentPrice: number;
  priceAsOfDate: string; // YYYY-MM-DD
  dataSource?: string;
}

/** year = report-period calendar year (A-share REPORT_YEAR semantics). */
export interface GrahamEpsRecord {
  /** Report-period calendar year, not fiscal period-end calendar year. */
  year: number;
  /** Diluted / adjusted EPS from the annual report for that year (sole EPS source). */
  adjustedEps: number;
}

export interface GrahamRoeRecord {
  year: number;
  roe: number;
}

export interface GrahamBvpsRecord {
  year: number;
  bvps: number;
}

export interface GrahamStockDataProvider {
  getStockSnapshot(stockCode: string): Promise<GrahamStockSnapshot>;
  getAdjustedEpsHistory(stockCode: string, startYear: number, endYear: number): Promise<GrahamEpsRecord[]>;
  getBvpsHistory(stockCode: string, startYear: number, endYear: number): Promise<GrahamBvpsRecord[]>;
  getLatestRoe(stockCode: string): Promise<GrahamRoeRecord>;
}

export class MockGrahamDataProvider implements GrahamStockDataProvider {
  async getStockSnapshot(stockCode: string): Promise<GrahamStockSnapshot> {
    if (stockCode === '000000') {
      throw new Error('未找到股票代码');
    }
    const asOfDate = new Date().toISOString().split('T')[0];
    return {
      stockCode,
      stockName: `Mock Stock ${stockCode}`,
      currentPrice: 15.20,
      priceAsOfDate: asOfDate,
    };
  }

  async getAdjustedEpsHistory(stockCode: string, startYear: number, endYear: number): Promise<GrahamEpsRecord[]> {
    if (stockCode === '000000') {
      throw new Error('未找到股票代码');
    }
    const history: GrahamEpsRecord[] = [];
    let currentEps = 1.0;
    for (let year = startYear; year <= endYear; year++) {
      if (stockCode === '999999' && year === startYear) {
        continue; // Mock missing start year
      }
      if (stockCode === '888888' && year === startYear) {
        history.push({ year, adjustedEps: -0.5 }); // Mock negative EPS
        continue;
      }
      history.push({ year, adjustedEps: currentEps });
      currentEps *= 1.1; // 10% growth mock
    }
    return history;
  }

  async getBvpsHistory(stockCode: string, startYear: number, endYear: number): Promise<GrahamBvpsRecord[]> {
    if (stockCode === '000000') {
      throw new Error('未找到股票代码');
    }
    const history: GrahamBvpsRecord[] = [];
    let currentBvps = 8.0;
    for (let year = startYear; year <= endYear; year++) {
      history.push({ year, bvps: currentBvps });
      currentBvps *= 1.05;
    }
    return history;
  }

  async getLatestRoe(stockCode: string): Promise<GrahamRoeRecord> {
    if (stockCode === '000000') {
      throw new Error('未找到股票代码');
    }
    return {
      year: new Date().getFullYear() - 1,
      roe: 15.5,
    };
  }
}
