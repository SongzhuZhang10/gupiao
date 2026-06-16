import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAnnualDilutedEpsFromCompanyFacts } from '../src/services/graham/secEdgarEps';

const nvdaFixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/secNvdaCompanyFacts.json'), 'utf8')
);

describe('parseAnnualDilutedEpsFromCompanyFacts', () => {
  it('maps NVDA 10-K diluted EPS to report-period calendar years', () => {
    const rows = parseAnnualDilutedEpsFromCompanyFacts(nvdaFixture);
    const byYear = Object.fromEntries(rows.map(row => [row.year, row.adjustedEps]));

    expect(byYear[2020]).toBe(1.73);
    expect(byYear[2022]).toBe(0.17);
    expect(byYear[2023]).toBe(1.19);
    expect(byYear[2025]).toBe(4.9);
  });
});
