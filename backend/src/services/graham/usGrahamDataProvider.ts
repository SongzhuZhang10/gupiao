import {
  GrahamBvpsRecord,
  GrahamEpsRecord,
  GrahamRoeRecord,
  GrahamStockDataProvider,
  GrahamStockSnapshot,
} from '../grahamDataProvider';
import { fetchSecCompanyFacts } from './secEdgarClient';
import { parseAnnualBvpsFromCompanyFacts } from './secEdgarBvps';
import { parseAnnualDilutedEpsFromCompanyFacts } from './secEdgarEps';
import { parseLatestAnnualRoeFromCompanyFacts } from './secEdgarRoe';
import { YahooGrahamDataProvider } from './yahooGrahamProvider';

/**
 * US Graham provider: Yahoo for live quote, SEC EDGAR 10-K for annual diluted EPS and ROE.
 */
export class UsGrahamDataProvider implements GrahamStockDataProvider {
  private readonly quoteProvider = new YahooGrahamDataProvider();
  private readonly companyFactsCache = new Map<string, Promise<Record<string, unknown>>>();

  private loadCompanyFacts(stockCode: string): Promise<Record<string, unknown>> {
    const key = stockCode.toUpperCase();
    const cached = this.companyFactsCache.get(key);
    if (cached) return cached;

    const pending = fetchSecCompanyFacts(key);
    this.companyFactsCache.set(key, pending);
    return pending;
  }

  async getStockSnapshot(stockCode: string): Promise<GrahamStockSnapshot> {
    return this.quoteProvider.getStockSnapshot(stockCode);
  }

  async getAdjustedEpsHistory(
    stockCode: string,
    startYear: number,
    endYear: number
  ): Promise<GrahamEpsRecord[]> {
    const companyFacts = await this.loadCompanyFacts(stockCode);
    const rows = parseAnnualDilutedEpsFromCompanyFacts(companyFacts);
    return rows.filter(row => row.year >= startYear && row.year <= endYear);
  }

  async getBvpsHistory(
    stockCode: string,
    startYear: number,
    endYear: number
  ): Promise<GrahamBvpsRecord[]> {
    const companyFacts = await this.loadCompanyFacts(stockCode);
    const rows = parseAnnualBvpsFromCompanyFacts(companyFacts);
    return rows.filter(row => row.year >= startYear && row.year <= endYear);
  }

  async getLatestRoe(stockCode: string): Promise<GrahamRoeRecord> {
    const companyFacts = await this.loadCompanyFacts(stockCode);
    return parseLatestAnnualRoeFromCompanyFacts(companyFacts);
  }
}
