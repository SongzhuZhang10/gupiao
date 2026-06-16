import { describe, expect, it } from 'vitest';
import { runGrahamPoolStorageCheck } from '../src/debug/commands/grahamPool';
import { parseCodesArg } from '../src/debug/utils/parseCodes';
import { parseDebugArgv } from '../src/debug/parseArgs';

describe('debug scaffold utilities', () => {
  it('parses comma-separated --codes', () => {
    expect(parseCodesArg('NVDA, AAPL, MSFT')).toEqual(['NVDA', 'AAPL', 'MSFT']);
    expect(parseCodesArg('')).toEqual([]);
  });

  it('parses verify and refresh-pool commands', () => {
    const parsed = parseDebugArgv([
      'graham',
      'refresh-pool',
      '--market',
      'us',
      '--codes',
      'NVDA,AAPL',
      '--start-year',
      '2020',
      '--end-year',
      '2025',
    ]);
    expect(parsed.subcommand).toBe('refresh-pool');
    expect(parsed.options.codes).toBe('NVDA,AAPL');
    expect(parsed.options.startYear).toBe(2020);
  });

  it('parses verify all with skip-api', () => {
    const parsed = parseDebugArgv(['verify', 'all', '--skip-api']);
    expect(parsed.command).toBe('verify');
    expect(parsed.subcommand).toBe('all');
    expect(parsed.options.skipApi).toBe(true);
  });

  it('pool-storage-check validates per-market isolation', () => {
    const report = runGrahamPoolStorageCheck();
    expect(report.ok).toBe(true);
    expect(report.data).toMatchObject({
      cnPool: ['600519.SH'],
      usPool: ['NVDA', 'AAPL'],
    });
  });
});
