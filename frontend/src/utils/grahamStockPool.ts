export const LEGACY_STOCK_POOL_KEY = 'grahamStockPool';

export function stockPoolStorageKey(market: string): string {
  return `grahamStockPool_${market}`;
}

function parseStockPoolJson(saved: string): string[] {
  try {
    const parsed = JSON.parse(saved) as unknown;
    return Array.isArray(parsed) ? parsed.filter((code): code is string => typeof code === 'string') : [];
  } catch {
    return [];
  }
}

export function readStockPool(market: string): string[] {
  if (typeof window === 'undefined') return [];
  const saved = localStorage.getItem(stockPoolStorageKey(market));
  if (saved) return parseStockPoolJson(saved);

  if (market === 'cn') {
    const legacy = localStorage.getItem(LEGACY_STOCK_POOL_KEY);
    if (!legacy) return [];
    const pool = parseStockPoolJson(legacy);
    if (pool.length > 0) {
      writeStockPool('cn', pool);
      localStorage.removeItem(LEGACY_STOCK_POOL_KEY);
    }
    return pool;
  }

  return [];
}

export function writeStockPool(market: string, pool: string[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(stockPoolStorageKey(market), JSON.stringify(pool));
}
