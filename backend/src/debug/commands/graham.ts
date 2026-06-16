import { DebugReport, DebugStepReport } from '../format';
import { createGrahamDataProvider } from '../../services/graham/createGrahamDataProvider';
import { evaluateGrahamInputs } from '../../services/graham/evaluateGraham';
import { normalizeStockCode, parseMarketRegion } from '../../utils/stock';

interface GrahamCommandOptions {
  market?: string;
  code?: string;
  startYear?: number;
  endYear?: number;
  y?: number;
  dataSource?: string;
}

function defaultYears(): { startYear: number; endYear: number } {
  const endYear = new Date().getFullYear() - 1;
  return { startYear: endYear - 5, endYear };
}

async function runStep<T>(name: string, fn: () => Promise<T>): Promise<{ step: DebugStepReport; value?: T }> {
  const started = Date.now();
  try {
    const value = await fn();
    return {
      step: { name, ok: true, durationMs: Date.now() - started, data: value },
      value,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      step: { name, ok: false, durationMs: Date.now() - started, error: message },
    };
  }
}

export async function runGrahamProbe(options: GrahamCommandOptions): Promise<DebugReport> {
  const started = Date.now();
  const market = parseMarketRegion(options.market);
  const code = normalizeStockCode(String(options.code ?? ''), market);
  const provider = createGrahamDataProvider(market, undefined, options.dataSource);
  const defaults = defaultYears();
  const startYear = options.startYear ?? defaults.startYear;
  const endYear = options.endYear ?? defaults.endYear;

  const steps: DebugStepReport[] = [];
  const snapshotResult = await runStep('snapshot', () => provider.getStockSnapshot(code));
  steps.push(snapshotResult.step);

  const epsResult = await runStep('eps_history', () =>
    provider.getAdjustedEpsHistory(code, startYear, endYear)
  );
  steps.push(epsResult.step);

  const roeResult = await runStep('roe_latest', () => provider.getLatestRoe(code));
  steps.push(roeResult.step);

  const ok =
    steps.every(step => step.ok) &&
    snapshotResult.step.ok &&
    epsResult.step.ok;
  const hints: string[] = [];
  if (!epsResult.step.ok) {
    hints.push('美股用 `sec probe` 查看 SEC 10-K 可用年份；A 股缩小 --start-year/--end-year 到有年报的年份。');
  }

  return {
    command: 'graham.probe',
    ok,
    durationMs: Date.now() - started,
    data: { market, code, startYear, endYear },
    steps,
    hints,
    error: ok ? undefined : { message: steps.find(s => !s.ok)?.error ?? 'probe failed' },
  };
}

export async function runGrahamEvaluate(options: GrahamCommandOptions): Promise<DebugReport> {
  const started = Date.now();
  const market = parseMarketRegion(options.market);
  const defaults = defaultYears();
  const rows = await evaluateGrahamInputs([
    {
      stockCode: String(options.code ?? ''),
      startYear: options.startYear ?? defaults.startYear,
      endYear: options.endYear ?? defaults.endYear,
      Y: options.y ?? 1.71,
      market,
    },
  ]);

  const row = rows[0];
  const ok = row?.status === 'OK' || row?.status === 'WARNING';
  return {
    command: 'graham.evaluate',
    ok,
    durationMs: Date.now() - started,
    data: { rows },
    error: ok ? undefined : { message: row?.message ?? 'evaluate failed', details: row },
    hints: ok
      ? undefined
      : [
          '若缺少 EPS 年份，用 `npm run debug -- graham probe --market us --code NVDA` 查看可用年报。',
          '前端应在 evaluate 成功后才写入股票池。',
        ],
  };
}

export async function runGrahamSimulateAdd(options: GrahamCommandOptions): Promise<DebugReport> {
  const evaluateReport = await runGrahamEvaluate(options);
  const row = (evaluateReport.data as { rows: Array<{ status: string; stockCode: string; message: string }> })
    ?.rows?.[0];
  const shouldAddToPool = row?.status === 'OK' || row?.status === 'WARNING';

  return {
    command: 'graham.simulate-add',
    ok: shouldAddToPool,
    durationMs: evaluateReport.durationMs,
    data: {
      shouldAddToPool,
      row,
      frontendBug:
        shouldAddToPool
          ? null
          : '当前 GUI 会在请求失败前写入股票池；simulate-add 预期为 false。',
    },
    steps: evaluateReport.data ? undefined : undefined,
    error: shouldAddToPool ? undefined : { message: row?.message ?? evaluateReport.error?.message ?? '不应加入股票池' },
    hints: evaluateReport.hints,
  };
}
