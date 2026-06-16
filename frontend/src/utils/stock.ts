import type { MarketRegion } from '../context/MarketContext';

export const A_SHARE_STOCK_CODE_ERROR = '请输入符合A股股票代码格式的代码，例如 600519 或 600519.SH';
export const US_STOCK_CODE_ERROR = '请输入符合美股代码格式的代码，例如 AAPL 或 BRK.B';

const SH_A_SHARE_RE = /^(600|601|603|605|688)\d{3}$/;
const SZ_A_SHARE_RE = /^(000|001|002|003|300|301)\d{3}$/;
const BJ_A_SHARE_RE = /^(43|83|87|92)\d{4}$/;
const US_TICKER_RE = /^[A-Z][A-Z0-9]{0,4}(\.[A-Z]{1,2})?$/;

export function normalizeUsStockCode(code: string): string {
  return code.trim().toUpperCase().replace(/-/g, '.');
}

export function normalizeAStockCode(code: string): string {
  const normalizedCode = code.trim();
  if (normalizedCode.includes('.')) {
    return normalizedCode.toUpperCase();
  }
  if (/^(600|601|603|605|688)\d{3}$/.test(normalizedCode) || normalizedCode.startsWith('6')) {
    return `${normalizedCode}.SH`;
  }
  if (/^(000|001|002|003|300|301)\d{3}$/.test(normalizedCode) || normalizedCode.startsWith('0') || normalizedCode.startsWith('3') || normalizedCode.startsWith('4') || normalizedCode.startsWith('8')) {
    if (normalizedCode.startsWith('4') || normalizedCode.startsWith('8')) {
        return `${normalizedCode}.BJ`;
    }
    return `${normalizedCode}.SZ`;
  }
  return normalizedCode;
}

export function normalizeStockCode(code: string, market: MarketRegion): string {
  return market === 'us' ? normalizeUsStockCode(code) : normalizeAStockCode(code);
}

export function isValidAShareStockCode(code: unknown): boolean {
  if (typeof code !== 'string') return false;
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) return false;

  const parts = normalizedCode.split('.');
  if (parts.length > 2) return false;

  const digits = parts[0];
  const suffix = parts.length === 2 ? parts[1] : undefined;

  if (!/^\d{6}$/.test(digits)) return false;
  if (parts.length === 2 && !suffix) return false;

  if (suffix === undefined) {
    return SH_A_SHARE_RE.test(digits) || SZ_A_SHARE_RE.test(digits) || BJ_A_SHARE_RE.test(digits);
  }
  if (suffix === 'SH') {
    return SH_A_SHARE_RE.test(digits);
  }
  if (suffix === 'SZ') {
    return SZ_A_SHARE_RE.test(digits);
  }
  if (suffix === 'BJ') {
    return BJ_A_SHARE_RE.test(digits);
  }
  return false;
}

export function isValidUsStockCode(code: unknown): boolean {
  if (typeof code !== 'string') return false;
  const normalizedCode = normalizeUsStockCode(code);
  if (!normalizedCode) return false;
  return US_TICKER_RE.test(normalizedCode);
}

export function isValidStockCode(code: unknown, market: MarketRegion): boolean {
  return market === 'us' ? isValidUsStockCode(code) : isValidAShareStockCode(code);
}

export function stockCodeErrorForMarket(market: MarketRegion): string {
  return market === 'us' ? US_STOCK_CODE_ERROR : A_SHARE_STOCK_CODE_ERROR;
}

export function stockCodePlaceholderForMarket(market: MarketRegion): string {
  return market === 'us' ? '例如 AAPL 或 BRK.B' : '例如 600519 或 600519.SH';
}
