import { describe, expect, it } from 'vitest';
import {
  hasSuccessfulValuation,
  normalizeCodesForPool,
  resolveAddStockFetchPlan,
} from './grahamAddStock';

describe('normalizeCodesForPool', () => {
  it('normalizes US tickers with hyphen to dot form', () => {
    expect(normalizeCodesForPool(['brk-b', 'AAPL'], 'us')).toEqual(['BRK.B', 'AAPL']);
  });
});

describe('resolveAddStockFetchPlan', () => {
  it('fetches new codes when pool is empty', () => {
    expect(resolveAddStockFetchPlan(['AAPL'], [], [])).toEqual({
      codesToFetch: ['AAPL'],
      duplicateOnly: [],
    });
  });

  it('re-fetches pool codes without successful valuation rows after failed load', () => {
    const plan = resolveAddStockFetchPlan(['AAPL'], ['AAPL'], []);
    expect(plan.codesToFetch).toEqual(['AAPL']);
    expect(plan.duplicateOnly).toEqual([]);
  });

  it('re-fetches when pool code only has ERROR row in table', () => {
    const plan = resolveAddStockFetchPlan(
      ['AAPL'],
      ['AAPL'],
      [{ stockCode: 'AAPL', status: 'ERROR' }]
    );
    expect(plan.codesToFetch).toEqual(['AAPL']);
    expect(plan.duplicateOnly).toEqual([]);
  });

  it('treats pool codes with OK or WARNING rows as duplicates', () => {
    expect(
      resolveAddStockFetchPlan(['AAPL'], ['AAPL'], [{ stockCode: 'AAPL', status: 'OK' }])
    ).toEqual({ codesToFetch: [], duplicateOnly: ['AAPL'] });

    expect(
      resolveAddStockFetchPlan(['AAPL'], ['AAPL'], [{ stockCode: 'AAPL', status: 'WARNING' }])
    ).toEqual({ codesToFetch: [], duplicateOnly: ['AAPL'] });
  });
});

describe('hasSuccessfulValuation', () => {
  it('ignores ERROR rows', () => {
    expect(hasSuccessfulValuation([{ stockCode: 'AAPL', status: 'ERROR' }], 'AAPL')).toBe(false);
  });
});
