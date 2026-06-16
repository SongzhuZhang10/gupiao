import type { ValuationStatusRow } from './grahamAddStock';

export interface GrahamPlaceholderParams {
  startYear: number;
  endYear: number;
}

export interface PoolDisplayRow extends ValuationStatusRow {
  stockCode: string;
  stockName: string;
  currentPrice: number;
  startYear: number;
  endYear: number;
  dataAsOfDate: string;
  message: string;
}

export function createGrahamPlaceholderRow(
  stockCode: string,
  params: GrahamPlaceholderParams,
  message: string,
  status: 'ERROR' | 'WARNING' = 'ERROR'
): PoolDisplayRow {
  return {
    stockCode,
    stockName: '',
    currentPrice: 0,
    startYear: params.startYear,
    endYear: params.endYear,
    dataAsOfDate: '',
    status,
    message,
  };
}

const LOADING_MESSAGE = '正在加载估值数据...';
const UNLOADED_MESSAGE = '估值数据未加载，请点击「全部刷新」重试';

/**
 * Builds one table row per stock-pool code, merging in valuation results when present.
 * Keeps the table in sync with stockPool count even after a failed fetch.
 */
export function buildDisplayRowsForPool<T extends ValuationStatusRow & { stockCode: string }>(
  pool: string[],
  rows: T[],
  options: { loading?: boolean; params?: GrahamPlaceholderParams }
): Array<T | PoolDisplayRow> {
  if (pool.length === 0) return [];

  const byCode = new Map(rows.map(row => [row.stockCode, row]));
  const placeholderMessage = options.loading ? LOADING_MESSAGE : UNLOADED_MESSAGE;
  const params = options.params ?? { startYear: 0, endYear: 0 };

  return pool.map(code => {
    const existing = byCode.get(code);
    if (existing) return existing;
    return createGrahamPlaceholderRow(code, params, placeholderMessage);
  });
}
