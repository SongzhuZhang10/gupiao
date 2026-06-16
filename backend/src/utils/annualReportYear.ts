/**
 * Maps an annual report period-end date to the report-period calendar year
 * (same semantics as A-share EastMoney REPORT_YEAR).
 *
 * For a 12-month fiscal year ending in (Y, M):
 * M >= 6 → report year Y; M < 6 → report year Y - 1
 */
export function annualReportYearFromAsOfDate(asOfDate: string): number {
  const [y, m] = asOfDate.split('-').map(Number);
  return m >= 6 ? y : y - 1;
}
