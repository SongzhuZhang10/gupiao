export function normalizeStockCode(code: string): string {
  // If it already has a suffix, return as is
  if (code.includes('.')) {
    return code.toUpperCase();
  }
  
  // Rule for 600/601/603/605/688 -> .SH
  if (/^(600|601|603|605|688)\d{3}$/.test(code) || code.startsWith('6')) {
    return `${code}.SH`;
  }
  
  // Rule for 000/002/003/300/301 -> .SZ
  if (/^(000|002|003|300|301)\d{3}$/.test(code) || code.startsWith('0') || code.startsWith('3')) {
    return `${code}.SZ`;
  }
  
  // Unmatched, return original
  return code;
}
