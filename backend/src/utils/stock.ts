export const A_SHARE_STOCK_CODE_ERROR = '请输入符合A股股票代码格式的代码，例如 600519 或 600519.SH';

const SH_A_SHARE_RE = /^(600|601|603|605|688)\d{3}$/;
const SZ_A_SHARE_RE = /^(000|001|002|003|300|301)\d{3}$/;

export function normalizeStockCode(code: string): string {
  const normalizedCode = code.trim();
  // If it already has a suffix, return as is
  if (normalizedCode.includes('.')) {
    return normalizedCode.toUpperCase();
  }
  
  // Rule for 600/601/603/605/688 -> .SH
  if (/^(600|601|603|605|688)\d{3}$/.test(normalizedCode) || normalizedCode.startsWith('6')) {
    return `${normalizedCode}.SH`;
  }
  
  // Rule for 000/002/003/300/301 -> .SZ
  if (/^(000|002|003|300|301)\d{3}$/.test(normalizedCode) || normalizedCode.startsWith('0') || normalizedCode.startsWith('3')) {
    return `${normalizedCode}.SZ`;
  }
  
  // Unmatched, return original
  return normalizedCode;
}

export function isValidAShareStockCode(code: string): boolean {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) return false;

  const [digits, suffix] = normalizedCode.split('.');
  if (!/^\d{6}$/.test(digits)) return false;

  if (!suffix) {
    return SH_A_SHARE_RE.test(digits) || SZ_A_SHARE_RE.test(digits);
  }

  if (suffix === 'SH') {
    return SH_A_SHARE_RE.test(digits);
  }

  if (suffix === 'SZ') {
    return SZ_A_SHARE_RE.test(digits);
  }

  return false;
}
