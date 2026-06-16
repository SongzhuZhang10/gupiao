import { GrahamRoeRecord } from '../grahamDataProvider';
import { parseAnnualUsdFactsByReportYear } from './secEdgarAnnual';

/**
 * ROE from latest annual 10-K: NetIncomeLoss / StockholdersEquity × 100 (%).
 * Same report-period calendar year semantics as A-share ROEKCJQ display.
 */
export function parseLatestAnnualRoeFromCompanyFacts(
  companyFacts: Record<string, unknown>
): GrahamRoeRecord {
  const netIncomeByYear = parseAnnualUsdFactsByReportYear(companyFacts, 'NetIncomeLoss');
  const equityByYear = parseAnnualUsdFactsByReportYear(companyFacts, 'StockholdersEquity');

  const years = Array.from(netIncomeByYear.keys())
    .filter(year => equityByYear.has(year))
    .sort((a, b) => b - a);

  if (years.length === 0) {
    throw new Error('缺少 ROE 数据');
  }

  const year = years[0];
  const netIncome = netIncomeByYear.get(year)!.val;
  const equity = equityByYear.get(year)!.val;

  if (!Number.isFinite(netIncome) || !Number.isFinite(equity) || equity <= 0) {
    throw new Error('缺少 ROE 数据');
  }

  return {
    year,
    roe: Number(((netIncome / equity) * 100).toFixed(2)),
  };
}
