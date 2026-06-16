/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_GRAHAM_TABLE_COLUMN_WIDTHS,
  GRAHAM_TABLE_COLUMN_WIDTH_STORAGE_KEY,
  clampGrahamTableColumnWidth,
  readGrahamTableColumnWidths,
  writeGrahamTableColumnWidths,
} from './grahamTableColumnWidths';

describe('grahamTableColumnWidths', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when storage is empty', () => {
    expect(readGrahamTableColumnWidths()).toEqual(DEFAULT_GRAHAM_TABLE_COLUMN_WIDTHS);
  });

  it('persists only known numeric widths', () => {
    localStorage.setItem(
      GRAHAM_TABLE_COLUMN_WIDTH_STORAGE_KEY,
      JSON.stringify({
        stockCode: 132,
        stockName: 148,
        unknownColumn: 999,
        currentPrice: 'wide',
      })
    );

    const widths = readGrahamTableColumnWidths();

    expect(widths.stockCode).toBe(132);
    expect(widths.stockName).toBe(148);
    expect(widths.currentPrice).toBe(DEFAULT_GRAHAM_TABLE_COLUMN_WIDTHS.currentPrice);
    expect(widths).not.toHaveProperty('unknownColumn');
  });

  it('falls back to defaults when storage contains invalid JSON', () => {
    localStorage.setItem(GRAHAM_TABLE_COLUMN_WIDTH_STORAGE_KEY, '{broken');

    expect(readGrahamTableColumnWidths()).toEqual(DEFAULT_GRAHAM_TABLE_COLUMN_WIDTHS);
  });

  it('clamps widths between each column minimum and maximum', () => {
    expect(clampGrahamTableColumnWidth('stockCode', 20)).toBe(64);
    expect(clampGrahamTableColumnWidth('stockCode', 1000)).toBe(220);
    expect(clampGrahamTableColumnWidth('grahamPrice', 141)).toBe(141);
  });

  it('writes clamped widths to localStorage', () => {
    writeGrahamTableColumnWidths({
      ...DEFAULT_GRAHAM_TABLE_COLUMN_WIDTHS,
      stockCode: 12,
      stockName: 999,
    });

    expect(JSON.parse(localStorage.getItem(GRAHAM_TABLE_COLUMN_WIDTH_STORAGE_KEY) || '{}')).toMatchObject({
      stockCode: 64,
      stockName: 260,
    });
  });
});
