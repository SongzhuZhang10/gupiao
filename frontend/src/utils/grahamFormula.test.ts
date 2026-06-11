import { describe, expect, it } from 'vitest';
import {
  computeGrahamPrice,
  computePriceDeviation,
  recalcValuationPrices,
  DEFAULT_R_GROWTH_COEFF,
} from './grahamFormula';

describe('grahamFormula', () => {
  it('computeGrahamPrice matches backend defaults', () => {
    expect(computeGrahamPrice(2, 5, 2)).toBeCloseTo(54, 2);
    expect(DEFAULT_R_GROWTH_COEFF).toBe(2);
  });

  it('recalcValuationPrices updates graham and simulation columns', () => {
    const row = {
      stockCode: 'TEST',
      endEPS: 2,
      R: 5,
      currentPrice: 100,
      grahamPrice: 1,
      grahamPriceR0: 1,
      grahamPriceR3: 1,
      grahamPriceR5: 1,
      priceDeviationPercent: 0,
    };
    const updated = recalcValuationPrices(row, { Y: 2, rGrowthCoeff: 2 });
    expect(updated.grahamPrice).toBeCloseTo(54, 2);
    expect(updated.grahamPriceR0).toBeCloseTo(18, 2);
    expect(updated.priceDeviationPercent).toBeCloseTo(46, 0);
  });

  it('computePriceDeviation returns NaN for non-positive price', () => {
    expect(computePriceDeviation(0, 54)).toBeNaN();
  });
});
