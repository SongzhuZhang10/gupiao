import { describe, it, expect } from 'vitest';
import { normalizeStockCode } from '../src/utils/stock';

describe('Stock Code Normalizer', () => {
  it('should not change already suffixed codes', () => {
    expect(normalizeStockCode('600519.SH')).toBe('600519.SH');
    expect(normalizeStockCode('000001.SZ')).toBe('000001.SZ');
  });

  it('should auto append .SH for 600, 601, 603, 605, 688 codes', () => {
    expect(normalizeStockCode('600519')).toBe('600519.SH');
    expect(normalizeStockCode('688981')).toBe('688981.SH');
    expect(normalizeStockCode('601398')).toBe('601398.SH');
  });

  it('should auto append .SZ for 000, 002, 003, 300, 301 codes', () => {
    expect(normalizeStockCode('000001')).toBe('000001.SZ');
    expect(normalizeStockCode('300059')).toBe('300059.SZ');
    expect(normalizeStockCode('002594')).toBe('002594.SZ');
  });

  it('should return original if unrecognized', () => {
    expect(normalizeStockCode('800000')).toBe('800000');
  });
});
