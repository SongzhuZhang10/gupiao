import { describe, expect, it } from 'vitest';
import { isRetryableGrahamError, pickAutoRetryCodes } from './grahamRetryPolicy';

describe('grahamRetryPolicy', () => {
  it('detects transient errors', () => {
    expect(isRetryableGrahamError('timeout of 8000ms exceeded')).toBe(true);
    expect(isRetryableGrahamError('All Graham providers failed for snapshot 600519.SH')).toBe(true);
    expect(isRetryableGrahamError('估值数据未加载，请点击「全部刷新」重试')).toBe(true);
  });

  it('rejects permanent business errors', () => {
    expect(isRetryableGrahamError('EPS 非正，CAGR 无法可靠计算')).toBe(false);
  });

  it('picks ERROR rows eligible for auto retry', () => {
    const rows = [
      { stockCode: 'A', status: 'OK' as const, message: '' },
      { stockCode: 'B', status: 'ERROR' as const, message: 'timeout' },
      { stockCode: 'C', status: 'ERROR' as const, message: 'EPS 非正' },
    ];
    expect(pickAutoRetryCodes(rows)).toEqual(['B']);
  });

  it('picks multiple retryable ERROR rows', () => {
    const rows = [
      { stockCode: 'A', status: 'ERROR' as const, message: 'timeout' },
      { stockCode: 'B', status: 'ERROR' as const, message: 'Network Error' },
      { stockCode: 'C', status: 'ERROR' as const, message: 'EPS 非正' },
    ];
    expect(pickAutoRetryCodes(rows)).toEqual(['A', 'B']);
  });

  it('treats stale cache warning as retryable', () => {
    expect(isRetryableGrahamError('外部数据源不可用，已返回过期本地缓存。')).toBe(true);
  });
});
