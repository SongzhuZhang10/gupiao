import { describe, expect, it } from 'vitest';
import { formatDebugReport } from '../src/debug/format';
import { parseDebugArgv } from '../src/debug/parseArgs';

describe('debug CLI parser', () => {
  it('parses graham evaluate command with flags', () => {
    const parsed = parseDebugArgv([
      'graham', 'evaluate',
      '--market', 'us',
      '--code', 'NVDA',
      '--start-year', '2020',
      '--end-year', '2025',
      '--y', '1.71',
    ]);

    expect(parsed).toEqual({
      command: 'graham',
      subcommand: 'evaluate',
      options: {
        market: 'us',
        code: 'NVDA',
        startYear: 2020,
        endYear: 2025,
        y: 1.71,
      },
    });
  });

  it('parses graham probe command', () => {
    const parsed = parseDebugArgv(['graham', 'probe', '--market', 'us', '--code', 'NVDA']);
    expect(parsed.command).toBe('graham');
    expect(parsed.subcommand).toBe('probe');
    expect(parsed.options.code).toBe('NVDA');
  });

  it('parses graham probe with --data-source', () => {
    const parsed = parseDebugArgv([
      'graham',
      'probe',
      '--market',
      'cn',
      '--code',
      '600519.SH',
      '--data-source',
      'sina',
    ]);
    expect(parsed.command).toBe('graham');
    expect(parsed.subcommand).toBe('probe');
    expect(parsed.options.market).toBe('cn');
    expect(parsed.options.code).toBe('600519.SH');
    expect(parsed.options.dataSource).toBe('sina');
  });

  it('parses stocks history command', () => {
    const parsed = parseDebugArgv([
      'stocks', 'history',
      '--market', 'us',
      '--code', 'NVDA',
      '--start', '2024-01-01',
      '--end', '2024-12-31',
    ]);
    expect(parsed.subcommand).toBe('history');
    expect(parsed.options.market).toBe('us');
  });
});

describe('debug CLI formatter', () => {
  it('emits stable JSON for agents', () => {
    const output = formatDebugReport({
      command: 'graham.probe',
      ok: false,
      durationMs: 12,
      steps: [{ name: 'snapshot', ok: true, durationMs: 5 }],
      error: { message: 'Yahoo 年度 EPS 数据不可用' },
    });
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(false);
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.error.message).toContain('EPS');
  });
});
