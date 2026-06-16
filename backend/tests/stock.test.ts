import { describe, it, expect } from 'vitest';
import {
  isValidAShareStockCode,
  isValidStockCode,
  isValidUsStockCode,
  normalizeStockCode,
  normalizeUsStockCode,
  parseMarketRegion,
} from '../src/utils/stock';

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

  it('should auto append .BJ for 83, 87, 43, 92 codes', () => {
    expect(normalizeStockCode('835185')).toBe('835185.BJ');
    expect(normalizeStockCode('430047')).toBe('430047.BJ');
  });

  it('should return original if unrecognized', () => {
    expect(normalizeStockCode('500000')).toBe('500000');
  });
});

describe('A-share Stock Code Sanity Check', () => {
  it('accepts 6-digit A-share codes with or without supported exchange suffixes', () => {
    expect(isValidAShareStockCode('600519')).toBe(true);
    expect(isValidAShareStockCode('600519.SH')).toBe(true);
    expect(isValidAShareStockCode('688981.sh')).toBe(true);
    expect(isValidAShareStockCode('000001')).toBe(true);
    expect(isValidAShareStockCode('300059.SZ')).toBe(true);
    expect(isValidAShareStockCode('835185')).toBe(true);
    expect(isValidAShareStockCode('430047.BJ')).toBe(true);
  });

  it('rejects malformed codes before data fetching', () => {
    expect(isValidAShareStockCode('60051')).toBe(false);
    expect(isValidAShareStockCode('6005199')).toBe(false);
    expect(isValidAShareStockCode('800000')).toBe(false);
    expect(isValidAShareStockCode('600519.BJ')).toBe(false);
    expect(isValidAShareStockCode('ABCDEF')).toBe(false);
    expect(isValidAShareStockCode('')).toBe(false);
  });
});

describe('US Stock Code Validation', () => {
  it('accepts common US tickers and normalizes hyphenated symbols', () => {
    expect(isValidUsStockCode('AAPL')).toBe(true);
    expect(isValidUsStockCode('brk.b')).toBe(true);
    expect(normalizeUsStockCode('brk-b')).toBe('BRK.B');
    expect(normalizeStockCode('aapl', 'us')).toBe('AAPL');
  });

  it('rejects malformed US tickers', () => {
    expect(isValidUsStockCode('')).toBe(false);
    expect(isValidUsStockCode('600519')).toBe(false);
    expect(isValidUsStockCode('TOOLONGTICKER')).toBe(false);
  });
});

describe('Market-aware stock validation', () => {
  it('routes validation by market', () => {
    expect(isValidStockCode('600519', 'cn')).toBe(true);
    expect(isValidStockCode('AAPL', 'us')).toBe(true);
    expect(isValidStockCode('AAPL', 'cn')).toBe(false);
    expect(isValidStockCode('600519', 'us')).toBe(false);
  });

  it('defaults unknown market query values to cn', () => {
    expect(parseMarketRegion('us')).toBe('us');
    expect(parseMarketRegion('cn')).toBe('cn');
    expect(parseMarketRegion('invalid')).toBe('cn');
  });
});
