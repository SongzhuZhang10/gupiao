import { describe, expect, it } from 'vitest';
import { buildDisplayRowsForPool } from './grahamPoolDisplay';

describe('buildDisplayRowsForPool', () => {
  const params = { startYear: 2020, endYear: 2025 };

  it('returns empty array when pool is empty', () => {
    expect(buildDisplayRowsForPool([], [], { params })).toEqual([]);
  });

  it('creates placeholder rows for pool codes missing valuation data', () => {
    const rows = buildDisplayRowsForPool(['AAPL', 'NVDA'], [], { params });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      stockCode: 'AAPL',
      status: 'ERROR',
      message: '估值数据未加载，请点击「全部刷新」重试',
    });
    expect(rows[1]).toMatchObject({ stockCode: 'NVDA', status: 'ERROR' });
  });

  it('uses loading placeholder message while fetching', () => {
    const rows = buildDisplayRowsForPool(['AAPL'], [], { loading: true, params });
    expect(rows[0]).toMatchObject({ message: '正在加载估值数据...' });
  });

  it('merges valuation rows and preserves pool order', () => {
    const valuation = {
      stockCode: 'NVDA',
      status: 'OK' as const,
      stockName: 'NVIDIA',
      currentPrice: 100,
      startYear: 2020,
      endYear: 2025,
      dataAsOfDate: '2026-06-11',
      message: '',
    };
    const rows = buildDisplayRowsForPool(['AAPL', 'NVDA'], [valuation], { params });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ stockCode: 'AAPL', status: 'ERROR' });
    expect(rows[1]).toBe(valuation);
  });
});
