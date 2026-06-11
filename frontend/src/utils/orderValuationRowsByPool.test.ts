import { describe, expect, it } from 'vitest';
import { orderValuationRowsByPool } from './orderValuationRowsByPool';

describe('orderValuationRowsByPool', () => {
  it('orders rows by stockPool and appends unknown codes at end', () => {
    const rows = [
      { stockCode: 'B' },
      { stockCode: 'A' },
      { stockCode: 'C' },
    ];
    expect(orderValuationRowsByPool(rows, ['A', 'C', 'B']).map(r => r.stockCode)).toEqual([
      'A',
      'C',
      'B',
    ]);
  });

  it('preserves pool-only codes not yet in rows', () => {
    const rows = [{ stockCode: 'A' }];
    expect(orderValuationRowsByPool(rows, ['A', 'Z']).map(r => r.stockCode)).toEqual(['A']);
  });
});
