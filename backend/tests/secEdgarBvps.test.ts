import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAnnualBvpsFromCompanyFacts } from '../src/services/graham/secEdgarBvps';

const nvdaFixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/secNvdaCompanyFacts.json'), 'utf8')
);

describe('parseAnnualBvpsFromCompanyFacts', () => {
  it('computes BVPS from SEC 10-K equity and shares outstanding', () => {
    const rows = parseAnnualBvpsFromCompanyFacts(nvdaFixture);
    expect(rows.find(row => row.year === 2023)?.bvps).toBe(17.47);
    expect(rows.find(row => row.year === 2024)?.bvps).toBe(32.25);
  });
});
