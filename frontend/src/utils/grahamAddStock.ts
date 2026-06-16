import type { MarketRegion } from '../context/MarketContext';
import { normalizeStockCode } from './stock';

export interface ValuationStatusRow {
  stockCode: string;
  status: 'OK' | 'ERROR' | 'WARNING';
}

export function normalizeCodesForPool(codes: string[], market: MarketRegion): string[] {
  return codes.map(code => normalizeStockCode(code, market));
}

export function hasSuccessfulValuation(data: ValuationStatusRow[], code: string): boolean {
  return data.some(row => row.stockCode === code && (row.status === 'OK' || row.status === 'WARNING'));
}

/**
 * Resolves which codes to fetch when adding stocks.
 * Codes may sit in stockPool (e.g. from localStorage) without successful valuation rows
 * after a failed load — those are treated as stale and re-fetched instead of rejected.
 */
export function resolveAddStockFetchPlan(
  normalizedCodes: string[],
  stockPool: string[],
  data: ValuationStatusRow[]
): { codesToFetch: string[]; duplicateOnly: string[] } {
  const duplicateCodes = normalizedCodes.filter(code => stockPool.includes(code));
  const pendingCodes = normalizedCodes.filter(code => !stockPool.includes(code));
  const staleInPool = duplicateCodes.filter(code => !hasSuccessfulValuation(data, code));
  const codesToFetch = [...new Set([...pendingCodes, ...staleInPool])];
  const duplicateOnly = duplicateCodes.filter(code => hasSuccessfulValuation(data, code));
  return { codesToFetch, duplicateOnly };
}
