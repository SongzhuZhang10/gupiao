import { describe, expect, it } from 'vitest';
import { eastMoneySecId, eastMoneySecuCode, eastMoneyPureCode } from '../src/utils/eastMoneySecId';

describe('eastMoneySecId', () => {
  it('maps SH to 1.xxxxxx', () => {
    expect(eastMoneySecId('600519.SH')).toBe('1.600519');
  });

  it('maps SZ to 0.xxxxxx', () => {
    expect(eastMoneySecId('000001.SZ')).toBe('0.000001');
  });

  it('maps BJ to 0.xxxxxx', () => {
    expect(eastMoneySecId('835185.BJ')).toBe('0.835185');
  });

  it('maps unsuffixed code to 0.xxxxxx as default', () => {
    expect(eastMoneySecId('600519')).toBe('0.600519');
  });
});

describe('eastMoneySecuCode', () => {
  it('preserves exchange suffix for datacenter SECUCODE filter', () => {
    expect(eastMoneySecuCode('835185.BJ')).toBe('835185.BJ');
    expect(eastMoneySecuCode('600519.SH')).toBe('600519.SH');
  });
});

describe('eastMoneyPureCode', () => {
  it('removes known exchange suffixes', () => {
    expect(eastMoneyPureCode('600519.SH')).toBe('600519');
    expect(eastMoneyPureCode('000001.SZ')).toBe('000001');
    expect(eastMoneyPureCode('835185.BJ')).toBe('835185');
  });
});
