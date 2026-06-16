import { describe, it, expect } from 'vitest';
import { normalizeStockCode } from './stock';

describe('normalizeStockCode', () => {
  it('should automatically append .SH for Shanghai stocks starting with 6', () => {
    expect(normalizeStockCode('600025', 'cn')).toBe('600025.SH');
    expect(normalizeStockCode('601988', 'cn')).toBe('601988.SH');
    expect(normalizeStockCode('688001', 'cn')).toBe('688001.SH');
  });

  it('should automatically append .SZ for Shenzhen stocks starting with 0 or 3', () => {
    expect(normalizeStockCode('000001', 'cn')).toBe('000001.SZ');
    expect(normalizeStockCode('002001', 'cn')).toBe('002001.SZ');
    expect(normalizeStockCode('300059', 'cn')).toBe('300059.SZ');
  });

  it('should automatically append .BJ for Beijing stocks starting with 4 or 8', () => {
    expect(normalizeStockCode('835185', 'cn')).toBe('835185.BJ');
    expect(normalizeStockCode('430047', 'cn')).toBe('430047.BJ');
  });

  it('should leave codes with suffix unchanged', () => {
    expect(normalizeStockCode('600025.SH', 'cn')).toBe('600025.SH');
    expect(normalizeStockCode('000001.sz', 'cn')).toBe('000001.SZ');
  });

  it('should handle US stocks correctly', () => {
    expect(normalizeStockCode('AAPL', 'us')).toBe('AAPL');
    expect(normalizeStockCode('brk-b', 'us')).toBe('BRK.B');
  });
});
