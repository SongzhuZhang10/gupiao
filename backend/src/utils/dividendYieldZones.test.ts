import { describe, expect, it } from 'vitest';
import {
  calculateDividendYieldZones,
  INSUFFICIENT_SAMPLE_MESSAGE,
  LOW_COVERAGE_WARNING,
} from './dividendYieldZones';
import { DividendEventRecord } from '../services/providers/types';

function bar(date: string, close?: number) {
  return {
    trade_date: date,
    open: close ?? 0,
    high: close ?? 0,
    low: close ?? 0,
    close,
    volume: 1,
    metadata: {
      logical_source: 'baostock' as const,
      access_layer: 'fixture',
      retrieved_at: '2026-06-03T00:00:00.000Z',
      symbol: '600519.SH',
      market: 'SH',
      source_priority_rank: 1,
      fallback_used: false,
      raw_field_map: {},
      quality_flags: [],
    },
  };
}

function event(exDate: string, cashDividend: number): DividendEventRecord {
  return {
    symbol: '600519.SH',
    ex_date: exDate,
    cash_dividend: cashDividend,
    metadata: {
      logical_source: 'cninfo',
      access_layer: 'fixture',
      retrieved_at: '2026-06-03T00:00:00.000Z',
      symbol: '600519.SH',
      market: 'SH',
      source_priority_rank: 1,
      fallback_used: false,
      raw_field_map: {},
      quality_flags: [],
    },
  };
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().split('T')[0];
}

describe('calculateDividendYieldZones', () => {
  it('calculates TTM cash dividends with the exclusive 365-day start and skips invalid closes', () => {
    const result = calculateDividendYieldZones({
      dailyBars: [
        bar('2024-01-01', 10),
        bar('2024-01-02', 20),
        bar('2024-01-03', 0),
        bar('2024-01-04', -5),
        bar('2024-01-05'),
      ],
      dividendEvents: [
        event('2023-01-01', 9),
        event('2023-01-02', 1),
        event('2024-01-01', 2),
        event('2024-01-03', 3),
      ],
      chartStartDate: '2024-01-01',
      chartEndDate: '2024-01-05',
      thresholdWindowStart: '2024-01-01',
      thresholdWindowEnd: '2024-01-05',
      lookbackYears: 5,
      dividendBasis: 'pre_tax',
      minValidSamples: 1,
    });

    expect(result.samples).toHaveLength(2);
    expect(result.samples[0]).toMatchObject({
      date: '2024-01-01',
      close: 10,
      ttmDividendPerShare: 3,
      dividendYield: 30,
    });
    expect(result.samples[1]).toMatchObject({
      date: '2024-01-02',
      close: 20,
      ttmDividendPerShare: 2,
      dividendYield: 10,
    });
  });

  it('keeps zero TTM dividend samples and classifies threshold equality into the higher-yield zone', () => {
    const result = calculateDividendYieldZones({
      dailyBars: [
        bar('2024-01-01', 100),
        bar('2024-01-02', 100),
        bar('2024-01-03', 100),
        bar('2024-01-04', 100),
        bar('2024-01-05', 100),
      ],
      dividendEvents: [
        event('2024-01-02', 2),
        event('2024-01-03', 2),
        event('2024-01-04', 2),
        event('2024-01-05', 2),
      ],
      chartStartDate: '2024-01-01',
      chartEndDate: '2024-01-05',
      thresholdWindowStart: '2024-01-01',
      thresholdWindowEnd: '2024-01-05',
      lookbackYears: 5,
      dividendBasis: 'pre_tax',
      minValidSamples: 1,
    });

    expect(result.samples.map(sample => sample.dividendYield)).toEqual([0, 2, 4, 6, 8]);
    expect(result.quantiles).toEqual({ q20: 1.6, q40: 3.2, q60: 4.8, q80: 6.4 });
    expect(result.samples.map(sample => sample.zoneId)).toEqual([
      'exit',
      'reduce',
      'hold',
      'add',
      'strong_buy',
    ]);
  });

  it('counts occurrence windows and annualized trading days from the valid sample span', () => {
    const result = calculateDividendYieldZones({
      dailyBars: [
        bar('2024-01-01', 100),
        bar('2024-01-02', 100),
        bar('2024-01-03', 100),
        bar('2024-01-04', 100),
        bar('2024-01-05', 100),
      ],
      dividendEvents: [
        event('2024-01-01', 1),
        event('2024-01-02', 1),
        event('2024-01-03', 5),
        event('2024-01-04', 1),
        event('2024-01-05', 1),
      ],
      chartStartDate: '2024-01-01',
      chartEndDate: '2024-01-05',
      thresholdWindowStart: '2024-01-01',
      thresholdWindowEnd: '2024-01-05',
      lookbackYears: 5,
      dividendBasis: 'pre_tax',
      minValidSamples: 1,
    });

    const strongBuy = result.stats.find(stat => stat.zoneId === 'strong_buy');
    const reduce = result.stats.find(stat => stat.zoneId === 'reduce');

    expect(strongBuy).toMatchObject({
      tradingDays: 1,
      tradingDayRatio: 0.2,
      averageTradingDaysPerYear: 1,
      occurrenceWindows: 1,
    });
    expect(reduce).toMatchObject({
      tradingDays: 1,
      tradingDayRatio: 0.2,
      averageTradingDaysPerYear: 1,
      occurrenceWindows: 1,
    });
  });

  it('rejects fewer than the minimum valid samples', () => {
    expect(() =>
      calculateDividendYieldZones({
        dailyBars: [bar('2024-01-01', 10)],
        dividendEvents: [],
        chartStartDate: '2024-01-01',
        chartEndDate: '2024-01-01',
        thresholdWindowStart: '2024-01-01',
        thresholdWindowEnd: '2024-01-01',
        lookbackYears: 5,
        dividendBasis: 'pre_tax',
        minValidSamples: 2,
      })
    ).toThrow(INSUFFICIENT_SAMPLE_MESSAGE);
  });

  it('warns when valid samples cover less than five years', () => {
    const dailyBars = Array.from({ length: 100 }, (_, index) => {
      return bar(addDays('2024-01-01', index), 10);
    });

    const result = calculateDividendYieldZones({
      dailyBars,
      dividendEvents: [],
      chartStartDate: '2024-01-01',
      chartEndDate: '2024-04-09',
      thresholdWindowStart: '2024-01-01',
      thresholdWindowEnd: '2024-04-09',
      lookbackYears: 5,
      dividendBasis: 'pre_tax',
      minValidSamples: 100,
    });

    expect(result.warnings).toContain(LOW_COVERAGE_WARNING);
  });
});
