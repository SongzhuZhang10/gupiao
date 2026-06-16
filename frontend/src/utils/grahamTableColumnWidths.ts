export const GRAHAM_TABLE_COLUMN_WIDTH_STORAGE_KEY = 'grahamPoolTableColumnWidths';

export const GRAHAM_TABLE_COLUMN_KEYS = [
  'sort',
  'stockCode',
  'stockName',
  'bvps',
  'currentPrice',
  'startEPS',
  'endEPS',
  'R',
  'grahamPrice',
  'priceDeviationPercent',
  'grahamPriceR0',
  'grahamPriceR3',
  'grahamPriceR5',
  'roeLatest',
  'status',
  'dataSource',
  'action',
] as const;

export type GrahamTableColumnKey = (typeof GRAHAM_TABLE_COLUMN_KEYS)[number];
export type GrahamTableColumnWidths = Record<GrahamTableColumnKey, number>;

export const DEFAULT_GRAHAM_TABLE_COLUMN_WIDTHS: GrahamTableColumnWidths = {
  sort: 44,
  stockCode: 96,
  stockName: 116,
  bvps: 92,
  currentPrice: 112,
  startEPS: 112,
  endEPS: 112,
  R: 80,
  grahamPrice: 128,
  priceDeviationPercent: 96,
  grahamPriceR0: 92,
  grahamPriceR3: 92,
  grahamPriceR5: 92,
  roeLatest: 84,
  status: 96,
  dataSource: 144,
  action: 104,
};

const MIN_WIDTHS: GrahamTableColumnWidths = {
  sort: 40,
  stockCode: 64,
  stockName: 72,
  bvps: 64,
  currentPrice: 72,
  startEPS: 76,
  endEPS: 76,
  R: 56,
  grahamPrice: 84,
  priceDeviationPercent: 72,
  grahamPriceR0: 64,
  grahamPriceR3: 64,
  grahamPriceR5: 64,
  roeLatest: 60,
  status: 72,
  dataSource: 96,
  action: 72,
};

const MAX_WIDTHS: GrahamTableColumnWidths = {
  sort: 80,
  stockCode: 220,
  stockName: 260,
  bvps: 180,
  currentPrice: 220,
  startEPS: 220,
  endEPS: 220,
  R: 160,
  grahamPrice: 240,
  priceDeviationPercent: 200,
  grahamPriceR0: 180,
  grahamPriceR3: 180,
  grahamPriceR5: 180,
  roeLatest: 160,
  status: 180,
  dataSource: 260,
  action: 180,
};

export function isGrahamTableColumnKey(value: string): value is GrahamTableColumnKey {
  return GRAHAM_TABLE_COLUMN_KEYS.includes(value as GrahamTableColumnKey);
}

export function clampGrahamTableColumnWidth(key: GrahamTableColumnKey, width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_GRAHAM_TABLE_COLUMN_WIDTHS[key];
  return Math.min(MAX_WIDTHS[key], Math.max(MIN_WIDTHS[key], Math.round(width)));
}

export function readGrahamTableColumnWidths(): GrahamTableColumnWidths {
  if (typeof window === 'undefined') return DEFAULT_GRAHAM_TABLE_COLUMN_WIDTHS;

  const saved = window.localStorage.getItem(GRAHAM_TABLE_COLUMN_WIDTH_STORAGE_KEY);
  if (!saved) return DEFAULT_GRAHAM_TABLE_COLUMN_WIDTHS;

  try {
    const parsed = JSON.parse(saved) as Record<string, unknown>;
    return GRAHAM_TABLE_COLUMN_KEYS.reduce<GrahamTableColumnWidths>((widths, key) => {
      const value = parsed[key];
      widths[key] = typeof value === 'number'
        ? clampGrahamTableColumnWidth(key, value)
        : DEFAULT_GRAHAM_TABLE_COLUMN_WIDTHS[key];
      return widths;
    }, { ...DEFAULT_GRAHAM_TABLE_COLUMN_WIDTHS });
  } catch {
    return DEFAULT_GRAHAM_TABLE_COLUMN_WIDTHS;
  }
}

export function writeGrahamTableColumnWidths(widths: GrahamTableColumnWidths): void {
  if (typeof window === 'undefined') return;

  const clamped = GRAHAM_TABLE_COLUMN_KEYS.reduce<GrahamTableColumnWidths>((next, key) => {
    next[key] = clampGrahamTableColumnWidth(key, widths[key]);
    return next;
  }, { ...DEFAULT_GRAHAM_TABLE_COLUMN_WIDTHS });

  window.localStorage.setItem(GRAHAM_TABLE_COLUMN_WIDTH_STORAGE_KEY, JSON.stringify(clamped));
}
