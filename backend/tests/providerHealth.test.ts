import { afterEach, describe, expect, it } from 'vitest';
import {
  isProviderHealthy,
  markProviderUnhealthy,
  resetProviderHealthForTest,
  shouldMarkUnhealthy,
} from '../src/services/providers/providerHealth';

describe('providerHealth', () => {
  afterEach(() => {
    resetProviderHealthForTest();
  });

  it('marks providers unhealthy for timeout-like failures', () => {
    expect(shouldMarkUnhealthy('timeout of 5000ms exceeded')).toBe(true);
    expect(shouldMarkUnhealthy('TUSHARE_TOKEN 未配置')).toBe(true);
    expect(shouldMarkUnhealthy('invalid snapshot price')).toBe(false);
  });

  it('skips recently unhealthy providers until ttl expires', () => {
    markProviderUnhealthy('baostock', 'daily_bars', 50);
    expect(isProviderHealthy('baostock', 'daily_bars')).toBe(false);
    expect(isProviderHealthy('eastmoney', 'daily_bars')).toBe(true);
  });
});
