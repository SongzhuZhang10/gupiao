import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLatestAnnualRoeFromCompanyFacts } from '../src/services/graham/secEdgarRoe';

const nvdaFixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/secNvdaCompanyFacts.json'), 'utf8')
);

describe('parseLatestAnnualRoeFromCompanyFacts', () => {
  it('computes latest annual ROE from SEC 10-K net income and equity', () => {
    const roe = parseLatestAnnualRoeFromCompanyFacts(nvdaFixture);
    expect(roe.year).toBeGreaterThanOrEqual(2024);
    expect(roe.roe).toBeGreaterThan(0);
    expect(roe.roe).toBeLessThan(200);
  });
});
