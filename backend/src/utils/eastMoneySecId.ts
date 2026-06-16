export function eastMoneyPureCode(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\.(SH|SZ|BJ)$/i, '');
}

export function eastMoneySecId(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  const pure = eastMoneyPureCode(upper);
  if (upper.endsWith('.SH')) return `1.${pure}`;
  return `0.${pure}`;
}

export function eastMoneySecuCode(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  if (/\.(SH|SZ|BJ)$/.test(upper)) return upper;
  return upper;
}
