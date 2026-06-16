import { describe, expect, it } from 'vitest';
import { parseDebugArgv } from '../src/debug/parseArgs';

describe('data-sources probe parser', () => {
  it('parses data-sources probe with code and overrides', () => {
    const parsed = parseDebugArgv([
      'data-sources',
      'probe',
      '--code',
      '600519.SH',
      '--overrides',
      'auto,eastmoney,sina',
    ]);

    expect(parsed).toEqual({
      command: 'data-sources',
      subcommand: 'probe',
      options: {
        code: '600519.SH',
        overrides: 'auto,eastmoney,sina',
      },
    });
  });
});
