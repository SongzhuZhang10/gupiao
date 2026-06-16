import { DebugReport } from '../format';
import { fetchSecCompanyFacts } from '../../services/graham/secEdgarClient';
import { parseAnnualDilutedEpsFromCompanyFacts } from '../../services/graham/secEdgarEps';

interface SecProbeOptions {
  code?: string;
  startYear?: number;
  endYear?: number;
}

function defaultYears(): { startYear: number; endYear: number } {
  const endYear = new Date().getFullYear() - 1;
  return { startYear: endYear - 5, endYear };
}

export async function runSecProbe(options: SecProbeOptions): Promise<DebugReport> {
  const started = Date.now();
  const code = String(options.code ?? '').trim().toUpperCase();
  const defaults = defaultYears();
  const startYear = options.startYear ?? defaults.startYear;
  const endYear = options.endYear ?? defaults.endYear;

  if (!code) {
    return {
      command: 'sec.probe',
      ok: false,
      durationMs: Date.now() - started,
      error: { message: '缺少 --code' },
      hints: ['示例: npm run debug -- sec probe --code NVDA --start-year 2020 --end-year 2025'],
    };
  }

  try {
    const facts = await fetchSecCompanyFacts(code);
    const allYears = parseAnnualDilutedEpsFromCompanyFacts(facts);
    const inRange = allYears.filter(row => row.year >= startYear && row.year <= endYear);
    const availableYears = allYears.map(row => row.year);
    const missingYears = Array.from(
      { length: endYear - startYear + 1 },
      (_, i) => startYear + i
    ).filter(year => !inRange.some(row => row.year === year));

    return {
      command: 'sec.probe',
      ok: inRange.length > 0,
      durationMs: Date.now() - started,
      data: {
        code,
        startYear,
        endYear,
        epsInRange: inRange,
        availableYears,
        missingYears,
        hasStartYear: inRange.some(row => row.year === startYear),
        hasEndYear: inRange.some(row => row.year === endYear),
      },
      hints:
        missingYears.length > 0
          ? [`缺少年份: ${missingYears.join(', ')}；可用年份: ${availableYears.join(', ')}`]
          : undefined,
      error:
        inRange.length === 0
          ? { message: `SEC 在 ${startYear}-${endYear} 无稀释 EPS 数据` }
          : undefined,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      command: 'sec.probe',
      ok: false,
      durationMs: Date.now() - started,
      error: { message },
      hints: [
        'SEC 要求合规 User-Agent，可在 .env 设置 SEC_EDGAR_USER_AGENT=YourName your@email.com',
      ],
    };
  }
}
