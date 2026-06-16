import { annualReportYearFromAsOfDate } from '../../utils/annualReportYear';

export interface SecAnnualFactEntry {
  end: string;
  val: number;
  fp: string;
  form: string;
  filed: string;
}

function readGaapFacts(
  companyFacts: Record<string, unknown>,
  tag: string,
  unit: string
): SecAnnualFactEntry[] {
  const facts = companyFacts.facts as Record<string, unknown> | undefined;
  const usGaap = facts?.['us-gaap'] as Record<string, unknown> | undefined;
  const node = usGaap?.[tag] as { units?: Record<string, SecAnnualFactEntry[]> } | undefined;
  const entries = node?.units?.[unit];
  if (!Array.isArray(entries)) {
    throw new Error(`SEC 年度 ${tag} 数据不可用`);
  }
  return entries;
}

function latestByEnd(entries: SecAnnualFactEntry[]): Map<string, SecAnnualFactEntry> {
  const byEnd = new Map<string, SecAnnualFactEntry>();
  for (const entry of entries) {
    if (!Number.isFinite(entry.val) || !entry.end) continue;
    const existing = byEnd.get(entry.end);
    if (!existing || entry.filed > existing.filed) {
      byEnd.set(entry.end, entry);
    }
  }
  return byEnd;
}

function detectFiscalYearEndMonth(byEnd: Map<string, SecAnnualFactEntry>): string {
  let latestEnd = '';
  for (const end of byEnd.keys()) {
    if (end > latestEnd) latestEnd = end;
  }
  return latestEnd.slice(5, 7);
}

/**
 * Map 10-K FY facts to report-period calendar year (same as A-share REPORT_YEAR).
 */
export function parseAnnualFactsByReportYear(
  companyFacts: Record<string, unknown>,
  tag: string,
  unit: string
): Map<number, SecAnnualFactEntry> {
  const annual = readGaapFacts(companyFacts, tag, unit).filter(
    entry => entry.form === '10-K' && entry.fp === 'FY'
  );
  const byEnd = latestByEnd(annual);
  if (byEnd.size === 0) {
    throw new Error(`SEC 年度 ${tag} 数据不可用`);
  }

  const fiscalEndMonth = detectFiscalYearEndMonth(byEnd);
  const annualEnds = Array.from(byEnd.values()).filter(
    entry => entry.end.slice(5, 7) === fiscalEndMonth
  );

  const byReportYear = new Map<number, SecAnnualFactEntry>();
  for (const entry of annualEnds) {
    const year = annualReportYearFromAsOfDate(entry.end);
    const existing = byReportYear.get(year);
    if (!existing || entry.filed > existing.filed) {
      byReportYear.set(year, entry);
    }
  }
  return byReportYear;
}

export function parseAnnualUsdFactsByReportYear(
  companyFacts: Record<string, unknown>,
  tag: string
): Map<number, SecAnnualFactEntry> {
  return parseAnnualFactsByReportYear(companyFacts, tag, 'USD');
}

export function parseAnnualDilutedEpsFacts(
  companyFacts: Record<string, unknown>
): Array<{ year: number; adjustedEps: number }> {
  const facts = companyFacts.facts as Record<string, unknown> | undefined;
  const usGaap = facts?.['us-gaap'] as Record<string, unknown> | undefined;
  const diluted = usGaap?.EarningsPerShareDiluted as { units?: Record<string, SecAnnualFactEntry[]> } | undefined;
  const entries = diluted?.units?.['USD/shares'];
  if (!Array.isArray(entries)) {
    throw new Error('SEC 年度稀释 EPS 数据不可用');
  }

  const byEnd = latestByEnd(
    entries.filter(entry => entry.form === '10-K' && entry.fp === 'FY')
  );
  if (byEnd.size === 0) {
    throw new Error('SEC 年度稀释 EPS 数据不可用');
  }

  const fiscalEndMonth = detectFiscalYearEndMonth(byEnd);
  const annualEnds = Array.from(byEnd.values()).filter(
    entry => entry.end.slice(5, 7) === fiscalEndMonth
  );

  const byReportYear = new Map<number, SecAnnualFactEntry>();
  for (const entry of annualEnds) {
    const year = annualReportYearFromAsOfDate(entry.end);
    const existing = byReportYear.get(year);
    if (!existing || entry.filed > existing.filed) {
      byReportYear.set(year, entry);
    }
  }

  return Array.from(byReportYear.entries())
    .map(([year, entry]) => ({ year, adjustedEps: entry.val }))
    .sort((a, b) => a.year - b.year);
}
