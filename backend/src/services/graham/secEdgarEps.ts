import { GrahamEpsRecord } from '../grahamDataProvider';
import { parseAnnualDilutedEpsFacts } from './secEdgarAnnual';

/**
 * Extract annual 10-K diluted EPS from SEC company facts.
 */
export function parseAnnualDilutedEpsFromCompanyFacts(
  companyFacts: Record<string, unknown>
): GrahamEpsRecord[] {
  return parseAnnualDilutedEpsFacts(companyFacts);
}
