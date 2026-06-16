import { describe, expect, it } from 'vitest';
import {
  reorderStockPoolBySortedRows,
  sortValuationRowsByDeviationAsc,
} from './sortGrahamPoolByDeviation';

describe('sortValuationRowsByDeviationAsc', () => {
  it('sorts rows by priceDeviationPercent ascending', () => {
    const rows = [
      { stockCode: 'B', priceDeviationPercent: 10 },
      { stockCode: 'A', priceDeviationPercent: -5 },
      { stockCode: 'C', priceDeviationPercent: 0 },
    ];
    expect(sortValuationRowsByDeviationAsc(rows).map(r => r.stockCode)).toEqual(['A', 'C', 'B']);
  });

  it('places rows without deviation at the bottom', () => {
    const rows = [
      { stockCode: 'ERR', priceDeviationPercent: undefined },
      { stockCode: 'OK', priceDeviationPercent: 3 },
      { stockCode: 'WARN', priceDeviationPercent: -1 },
    ];
    expect(sortValuationRowsByDeviationAsc(rows).map(r => r.stockCode)).toEqual(['WARN', 'OK', 'ERR']);
  });

  it('uses stockCode as tiebreaker when deviation is equal', () => {
    const rows = [
      { stockCode: 'ZZ', priceDeviationPercent: 1 },
      { stockCode: 'AA', priceDeviationPercent: 1 },
    ];
    expect(sortValuationRowsByDeviationAsc(rows).map(r => r.stockCode)).toEqual(['AA', 'ZZ']);
  });
});

describe('reorderStockPoolBySortedRows', () => {
  it('reorders stock pool to match sorted valuation rows', () => {
    const pool = ['TSLA', 'AAPL', 'NVDA'];
    const sortedRows = [
      { stockCode: 'NVDA' },
      { stockCode: 'AAPL' },
      { stockCode: 'TSLA' },
    ];
    expect(reorderStockPoolBySortedRows(pool, sortedRows)).toEqual(['NVDA', 'AAPL', 'TSLA']);
  });

  it('appends pool codes missing from sorted rows at the end', () => {
    const pool = ['AAPL', 'MSFT'];
    const sortedRows = [{ stockCode: 'MSFT' }];
    expect(reorderStockPoolBySortedRows(pool, sortedRows)).toEqual(['MSFT', 'AAPL']);
  });
});
