export function orderValuationRowsByPool<T extends { stockCode: string }>(
  rows: T[],
  pool: string[]
): T[] {
  const byCode = new Map(rows.map(row => [row.stockCode, row]));
  const ordered: T[] = [];
  for (const code of pool) {
    const row = byCode.get(code);
    if (row) ordered.push(row);
  }
  for (const row of rows) {
    if (!pool.includes(row.stockCode)) ordered.push(row);
  }
  return ordered;
}
