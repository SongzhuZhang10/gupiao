import { describe, expect, it } from 'vitest';
import { isTransientGrahamError, sleep } from '../src/services/graham/grahamRetry';

describe('isTransientGrahamError', () => {
  it('matches timeout and network errors', () => {
    expect(isTransientGrahamError(new Error('timeout of 8000ms exceeded'))).toBe(true);
    expect(isTransientGrahamError(new Error('socket hang up'))).toBe(true);
    expect(isTransientGrahamError(new Error('getaddrinfo ENOTFOUND'))).toBe(true);
  });

  it('does not match business validation errors', () => {
    expect(isTransientGrahamError(new Error('缺少 2019 年扣非 EPS 数据'))).toBe(false);
    expect(isTransientGrahamError(new Error('EPS 非正，CAGR 无法可靠计算'))).toBe(false);
  });
});

describe('sleep', () => {
  it('waits at least ms', async () => {
    const start = Date.now();
    await sleep(30);
    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
  });
});
