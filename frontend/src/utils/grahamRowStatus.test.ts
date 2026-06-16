import { describe, expect, it } from 'vitest';
import {
  formatGrahamStatusMessage,
  grahamStatusTagColor,
  grahamStatusLabel,
  isGrahamRowRetryable,
} from './grahamRowStatus';

describe('grahamRowStatus', () => {
  it('labels OK/WARNING/ERROR', () => {
    expect(grahamStatusLabel('OK')).toBe('正常');
    expect(grahamStatusLabel('WARNING')).toBe('部分缺失');
    expect(grahamStatusLabel('ERROR')).toBe('失败');
  });

  it('formats message for tooltip', () => {
    expect(formatGrahamStatusMessage({ status: 'OK', message: '' })).toBe('数据完整');
    expect(formatGrahamStatusMessage({ status: 'ERROR', message: '缺少 2019 年扣非 EPS 数据' }))
      .toBe('缺少 2019 年扣非 EPS 数据');
  });

  it('marks ERROR and placeholder rows retryable', () => {
    expect(isGrahamRowRetryable({ status: 'ERROR', message: 'timeout of 8000ms exceeded' })).toBe(true);
    expect(isGrahamRowRetryable({ status: 'ERROR', message: '估值数据未加载，请点击「全部刷新」重试' })).toBe(true);
    expect(isGrahamRowRetryable({ status: 'ERROR', message: '' })).toBe(true);
    expect(isGrahamRowRetryable({ status: 'ERROR', message: 'EPS 非正，CAGR 无法可靠计算' })).toBe(false);
    expect(isGrahamRowRetryable({ status: 'WARNING', message: 'ROE 暂不可用' })).toBe(false);
    expect(isGrahamRowRetryable({ status: 'OK', message: '' })).toBe(false);
  });

  it('maps tag colors', () => {
    expect(grahamStatusTagColor('OK')).toBe('success');
    expect(grahamStatusTagColor('WARNING')).toBe('warning');
    expect(grahamStatusTagColor('ERROR')).toBe('error');
  });
});
