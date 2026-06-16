import { GrahamBvpsRecord } from '../grahamDataProvider';
import { parseAnnualFactsByReportYear, parseAnnualUsdFactsByReportYear } from './secEdgarAnnual';

/**
 * BVPS from latest annual 10-K: StockholdersEquity / EntityCommonStockSharesOutstanding.
 */
export function parseAnnualBvpsFromCompanyFacts(
  companyFacts: Record<string, unknown>
): GrahamBvpsRecord[] {
  const equityByYear = parseAnnualUsdFactsByReportYear(companyFacts, 'StockholdersEquity');
  const sharesByYear = parseAnnualFactsByReportYear(
    companyFacts,
    'EntityCommonStockSharesOutstanding',
    'shares'
  );

  const years = Array.from(equityByYear.keys())
    .filter(year => sharesByYear.has(year))
    .sort((a, b) => a - b);

  if (years.length === 0) {
    throw new Error('SEC 年度 BVPS 数据不可用');
  }

  return years.flatMap(year => {
    const equity = equityByYear.get(year)!.val;
    const shares = sharesByYear.get(year)!.val;
    if (!Number.isFinite(equity) || !Number.isFinite(shares) || shares <= 0) {
      return [];
    }
    return [{ year, bvps: Number((equity / shares).toFixed(2)) }];
  });
}
