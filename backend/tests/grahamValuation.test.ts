import {
  computeGrahamPrice,
  computeCagrR,
  computePriceDeviation,
  validateInput
} from '../src/utils/grahamValuation';
import { MockGrahamDataProvider } from '../src/services/grahamDataProvider';
import { describe, it, expect } from 'vitest';

describe('Graham Valuation Pure Functions', () => {
  it('computeGrahamPrice_basic', () => {
    const V = computeGrahamPrice(2, 5, 2);
    expect(V).toBeCloseTo(81.40, 2);
  });

  it('computeGrahamPrice_R3', () => {
    const V = computeGrahamPrice(2, 3, 2);
    expect(V).toBeCloseTo(63.80, 2);
  });

  it('computeGrahamPrice_R7', () => {
    const V = computeGrahamPrice(2, 7, 2);
    expect(V).toBeCloseTo(99.00, 2);
  });

  it('computeCagrR_basic', () => {
    const R = computeCagrR(1.00, 1.21, 2);
    expect(R).toBeCloseTo(10.00, 2);
  });

  it('computePriceDeviation_basic', () => {
    const dev = computePriceDeviation(100, 81.40);
    expect(dev).toBeCloseTo(18.60, 2);
  });

  it('reject_zero_Y', () => {
    expect(() => validateInput({ stockCode: '600519', startYear: 2019, endYear: 2024, Y: 0 })).toThrow('Y 必须大于 0');
  });

  it('reject_negative_Y', () => {
    expect(() => validateInput({ stockCode: '600519', startYear: 2019, endYear: 2024, Y: -1 })).toThrow('Y 必须大于 0');
  });

  it('reject_invalid_year_range', () => {
    expect(() => validateInput({ stockCode: '600519', startYear: 2024, endYear: 2024, Y: 2 })).toThrow('开始年份必须早于结束年份');
  });

  it('reject_zero_startEPS', () => {
    expect(() => computeCagrR(0, 1.21, 2)).toThrow('EPS 非正，CAGR 无法可靠计算');
  });

  it('reject_negative_startEPS', () => {
    expect(() => computeCagrR(-1, 1.21, 2)).toThrow('EPS 非正，CAGR 无法可靠计算');
  });
});

describe('Graham Valuation Data Provider', () => {
  it('mock provider returns stable data', async () => {
    const provider = new MockGrahamDataProvider();
    const snapshot = await provider.getStockSnapshot('600519');
    expect(snapshot.stockCode).toBe('600519');
    expect(snapshot.currentPrice).toBe(15.20);
    
    const eps = await provider.getAdjustedEpsHistory('600519', 2020, 2022);
    expect(eps.length).toBe(3);
    
    const roe = await provider.getLatestRoe('600519');
    expect(roe.roe).toBe(15.5);
  });
  
  it('batch_partial_failure - should be handled in route/service level, simulating error', async () => {
    const provider = new MockGrahamDataProvider();
    await expect(provider.getStockSnapshot('000000')).rejects.toThrow('未找到股票代码');
  });
});
