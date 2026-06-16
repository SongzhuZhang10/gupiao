export interface DeviationSortableRow {
  stockCode: string;
  priceDeviationPercent?: number;
}

function deviationSortKey(row: DeviationSortableRow): number {
  return row.priceDeviationPercent ?? Number.POSITIVE_INFINITY;
}

export function sortValuationRowsByDeviationAsc<T extends DeviationSortableRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const diff = deviationSortKey(a) - deviationSortKey(b);
    if (diff !== 0) return diff;
    return a.stockCode.localeCompare(b.stockCode);
  });
}

export function reorderStockPoolBySortedRows(
  stockPool: string[],
  sortedRows: Array<{ stockCode: string }>
): string[] {
  const sortedCodes = sortedRows.map(row => row.stockCode);
  const sortedSet = new Set(sortedCodes);
  const trailing = stockPool.filter(code => !sortedSet.has(code));
  return [...sortedCodes.filter(code => stockPool.includes(code)), ...trailing];
}
