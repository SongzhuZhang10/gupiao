import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readStockPool, stockPoolStorageKey, writeStockPool } from './grahamStockPool';

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe('grahamStockPool storage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
    vi.stubGlobal('window', { localStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses market-specific storage keys', () => {
    expect(stockPoolStorageKey('cn')).toBe('grahamStockPool_cn');
    expect(stockPoolStorageKey('us')).toBe('grahamStockPool_us');
  });

  it('reads and writes pools per market without cross-contamination', () => {
    writeStockPool('cn', ['600519.SH']);
    writeStockPool('us', ['NVDA', 'AAPL']);

    expect(readStockPool('cn')).toEqual(['600519.SH']);
    expect(readStockPool('us')).toEqual(['NVDA', 'AAPL']);
  });

  it('migrates legacy grahamStockPool key into cn market pool', () => {
    localStorage.setItem('grahamStockPool', JSON.stringify(['600519.SH', '000858.SZ']));

    expect(readStockPool('cn')).toEqual(['600519.SH', '000858.SZ']);
    expect(localStorage.getItem('grahamStockPool_cn')).toBe(JSON.stringify(['600519.SH', '000858.SZ']));
    expect(localStorage.getItem('grahamStockPool')).toBeNull();
  });

  it('does not migrate legacy pool into us market', () => {
    localStorage.setItem('grahamStockPool', JSON.stringify(['600519.SH']));

    expect(readStockPool('us')).toEqual([]);
    expect(localStorage.getItem('grahamStockPool')).toBe(JSON.stringify(['600519.SH']));
  });
});
