import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { DebugReport, DebugStepReport } from '../format';
import { runApiPing } from './api';
import { runGrahamPoolStorageCheck, runGrahamRefreshPool } from './grahamPool';
import { runDataSourcesProbe } from './dataSources';
import { runGrahamEvaluate } from './graham';
import { runSecProbe } from './sec';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

/** Core suites agents rely on; excludes flaky/env-specific stock-cache tests. */
const BACKEND_CORE_TEST_ARGS = [
  'debugScaffold',
  'debugCli',
  'graham',
  'sec',
  'secEdgarRoe',
  'annualReportYear',
  'evaluateGraham',
  'grahamProviders',
  'grahamValuation',
  'grahamRoute',
];

function runNpmTest(cwd: string, patterns?: string[]): DebugStepReport {
  const started = Date.now();
  const args = ['vitest', 'run', ...(patterns ?? [])];
  const result = spawnSync('npx', args, {
    cwd,
    shell: process.platform === 'win32',
    encoding: 'utf8',
    env: process.env,
  });

  const ok = result.status === 0;
  return {
    name: patterns?.length ? `unit:${patterns.join('+')}` : 'unit:all',
    ok,
    durationMs: Date.now() - started,
    data: {
      cwd,
      exitCode: result.status,
      stdoutTail: (result.stdout ?? '').slice(-1200),
      stderrTail: (result.stderr ?? '').slice(-800),
    },
    error: ok ? undefined : `vitest 失败 exit=${result.status}`,
  };
}

export async function runVerifyUnit(): Promise<DebugReport> {
  const started = Date.now();
  const steps: DebugStepReport[] = [
    runNpmTest(path.join(REPO_ROOT, 'backend'), BACKEND_CORE_TEST_ARGS),
    runNpmTest(path.join(REPO_ROOT, 'frontend')),
  ];
  const ok = steps.every(step => step.ok);

  return {
    command: 'verify.unit',
    ok,
    durationMs: Date.now() - started,
    steps,
    error: ok ? undefined : { message: '单元测试未全部通过' },
  };
}

export async function runVerifyLive(): Promise<DebugReport> {
  const started = Date.now();
  const steps: DebugStepReport[] = [];

  const storageReport = runGrahamPoolStorageCheck();
  steps.push({
    name: 'graham.pool-storage-check',
    ok: storageReport.ok,
    durationMs: storageReport.durationMs,
    data: storageReport.data,
    error: storageReport.error?.message,
  });

  const secReport = await runSecProbe({ code: 'NVDA', startYear: 2020, endYear: 2025 });
  const secData = secReport.data as { hasStartYear?: boolean; hasEndYear?: boolean } | undefined;
  steps.push({
    name: 'sec.probe.NVDA',
    ok: secReport.ok && secData?.hasStartYear === true && secData?.hasEndYear === true,
    durationMs: secReport.durationMs,
    data: secReport.data,
    error: secReport.error?.message,
  });

  const nvdaEval = await runGrahamEvaluate({
    market: 'us',
    code: 'NVDA',
    startYear: 2020,
    endYear: 2025,
    y: 1.71,
  });
  const nvdaRow = (nvdaEval.data as {
    rows: Array<{ startEPS?: number; endEPS?: number; roeLatest?: number; message: string; status: string }>;
  })?.rows?.[0];
  steps.push({
    name: 'graham.evaluate.NVDA_2020_2025',
    ok:
      nvdaEval.ok &&
      nvdaRow?.startEPS != null &&
      nvdaRow?.endEPS != null &&
      nvdaRow?.roeLatest != null &&
      !nvdaRow.message.includes('ROE 暂不可用') &&
      (nvdaRow.status === 'OK' || nvdaRow.status === 'WARNING'),
    durationMs: nvdaEval.durationMs,
    data: nvdaRow,
    error: nvdaEval.error?.message,
  });

  const dataSourcesReport = await runDataSourcesProbe({ code: '600519.SH' });
  steps.push({
    name: 'data-sources.probe.600519',
    ok: dataSourcesReport.ok,
    durationMs: dataSourcesReport.durationMs,
    data: dataSourcesReport.data,
    error: dataSourcesReport.error?.message,
  });

  const refreshReport = await runGrahamRefreshPool({
    market: 'us',
    codes: 'NVDA,AAPL',
    startYear: 2020,
    endYear: 2025,
    y: 1.71,
  });
  steps.push({
    name: 'graham.refresh-pool',
    ok: refreshReport.ok,
    durationMs: refreshReport.durationMs,
    data: refreshReport.data,
    error: refreshReport.error?.message,
  });

  const ok = steps.every(step => step.ok);

  return {
    command: 'verify.live',
    ok,
    durationMs: Date.now() - started,
    steps,
    hints: ok
      ? ['Live 验证通过：SEC EPS、NVDA 2020-2025、批量刷新均正常']
      : ['查看失败 step 的 data/error；SEC 需网络与合规 User-Agent'],
    error: ok ? undefined : { message: 'Live 验证存在失败项' },
  };
}

export async function runVerifyAll(options: { skipApi?: boolean; baseUrl?: string } = {}): Promise<DebugReport> {
  const started = Date.now();
  const unitReport = await runVerifyUnit();
  const liveReport = await runVerifyLive();

  const steps: DebugStepReport[] = [
    ...(unitReport.steps ?? []),
    ...(liveReport.steps ?? []),
  ];

  let apiReport: DebugReport | undefined;
  if (!options.skipApi) {
    apiReport = await runApiPing({ baseUrl: options.baseUrl });
    steps.push({
      name: 'api.ping',
      ok: apiReport.ok,
      durationMs: apiReport.durationMs,
      data: apiReport.data,
      error: apiReport.error?.message,
    });
  }

  const requiredOk = unitReport.ok && liveReport.ok;
  const apiOk = options.skipApi || apiReport?.ok === true;
  const ok = requiredOk && apiOk;

  return {
    command: 'verify.all',
    ok,
    durationMs: Date.now() - started,
    data: {
      unit: { ok: unitReport.ok },
      live: { ok: liveReport.ok },
      api: options.skipApi ? { skipped: true } : { ok: apiReport?.ok ?? false },
    },
    steps,
    hints: [
      '日常自检: npm run verify（根目录）或 cd backend && npm run debug -- verify all --skip-api',
      '含 HTTP 集成: 先 npm run dev:backend，再 npm run debug -- verify all',
    ],
    error: ok ? undefined : { message: 'verify.all 存在失败项，见 steps' },
  };
}
