#!/usr/bin/env node
import '../loadEnv';
import { runDataSourcesProbe } from './commands/dataSources';
import { runApiPing } from './commands/api';
import { runGrahamEvaluate, runGrahamProbe, runGrahamSimulateAdd } from './commands/graham';
import { runGrahamPoolStorageCheck, runGrahamRefreshPool } from './commands/grahamPool';
import { runHealthCheck } from './commands/health';
import { runSecProbe } from './commands/sec';
import { runStocksHistory } from './commands/stocks';
import { runVerifyAll, runVerifyLive, runVerifyUnit } from './commands/verify';
import { formatDebugReport } from './format';
import { parseDebugArgv } from './parseArgs';

function printHelp(): void {
  console.log(`Gupiao Debug CLI (agent-friendly JSON output)

Usage:
  npm run debug -- <command> <subcommand> [flags]

Commands:
  health
  verify unit                    Run backend + frontend unit tests
  verify live                    Live smoke: SEC EPS, NVDA 2020-2025, refresh-pool
  verify all [--skip-api]        unit + live + optional API ping (backend must be up)
  api ping [--base-url URL]      GET /api/health + POST /api/graham/evaluate smoke
  sec probe --code NVDA [--start-year N] [--end-year N]
  graham probe     --market cn|us --code <symbol> [--start-year N] [--end-year N] [--data-source NAME]
  graham evaluate  --market cn|us --code <symbol> [--start-year N] [--end-year N] [--y N]
  data-sources probe --code <symbol> [--overrides auto,eastmoney,...]
  graham refresh-pool --market cn|us --codes A,B,C [--start-year N] [--end-year N] [--y N]
  graham pool-storage-check      Simulate per-market localStorage isolation
  graham simulate-add            Mimics GUI add-stock; reports shouldAddToPool
  stocks history   --market cn|us --code <symbol> --start YYYY-MM-DD --end YYYY-MM-DD

Quick self-check (no running server):
  npm run verify

Full check (start backend first):
  npm run dev:backend
  npm run debug -- verify all

Examples:
  npm run debug -- health
  npm run debug -- sec probe --code NVDA --start-year 2020 --end-year 2025
  npm run debug -- graham refresh-pool --market us --codes NVDA,AAPL --start-year 2020 --end-year 2025
  npm run debug -- graham pool-storage-check
  npm run debug -- verify live
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help') {
    printHelp();
    process.exit(0);
  }

  try {
    const parsed = parseDebugArgv(argv);
    let report;

    if (parsed.command === 'health') {
      report = runHealthCheck();
    } else if (parsed.command === 'verify' && parsed.subcommand === 'unit') {
      report = await runVerifyUnit();
    } else if (parsed.command === 'verify' && parsed.subcommand === 'live') {
      report = await runVerifyLive();
    } else if (parsed.command === 'verify' && parsed.subcommand === 'all') {
      report = await runVerifyAll({
        skipApi: parsed.options.skipApi === true,
        baseUrl: parsed.options.baseUrl as string | undefined,
      });
    } else if (parsed.command === 'api' && parsed.subcommand === 'ping') {
      report = await runApiPing({ baseUrl: parsed.options.baseUrl as string | undefined });
    } else if (parsed.command === 'sec' && parsed.subcommand === 'probe') {
      report = await runSecProbe(parsed.options);
    } else if (parsed.command === 'data-sources' && parsed.subcommand === 'probe') {
      report = await runDataSourcesProbe(parsed.options);
    } else if (parsed.command === 'graham' && parsed.subcommand === 'probe') {
      report = await runGrahamProbe(parsed.options);
    } else if (parsed.command === 'graham' && parsed.subcommand === 'evaluate') {
      report = await runGrahamEvaluate(parsed.options);
    } else if (parsed.command === 'graham' && parsed.subcommand === 'refresh-pool') {
      report = await runGrahamRefreshPool(parsed.options);
    } else if (parsed.command === 'graham' && parsed.subcommand === 'pool-storage-check') {
      report = runGrahamPoolStorageCheck();
    } else if (parsed.command === 'graham' && parsed.subcommand === 'simulate-add') {
      report = await runGrahamSimulateAdd(parsed.options);
    } else if (parsed.command === 'stocks' && parsed.subcommand === 'history') {
      report = await runStocksHistory(parsed.options);
    } else {
      throw new Error(`未知命令: ${parsed.command} ${parsed.subcommand}`);
    }

    console.log(formatDebugReport(report));
    process.exit(report.ok ? 0 : 1);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      formatDebugReport({
        command: argv.join(' '),
        ok: false,
        durationMs: 0,
        error: { message },
        hints: ['运行 npm run debug -- help 查看用法'],
      })
    );
    process.exit(1);
  }
}

void main();
