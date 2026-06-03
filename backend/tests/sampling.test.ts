import { describe, it, expect } from 'vitest';
import { sampleWeeklyData, DailyData, getISOWeek } from '../src/utils/sampling';

describe('Sampling Utils', () => {
  it('should get correct ISO week', () => {
    expect(getISOWeek('2024-01-01')).toBe('2024-W01'); // 2024-01-01 is Monday
    expect(getISOWeek('2024-01-07')).toBe('2024-W01'); // Sunday
    expect(getISOWeek('2024-06-05')).toBe('2024-W23'); // Wed
  });

  it('should sample Friday if available', () => {
    const data: DailyData[] = [
      { trade_date: '2024-06-03', close: 100 }, // Mon
      { trade_date: '2024-06-06', close: 101 }, // Thu
      { trade_date: '2024-06-07', close: 102 }, // Fri
    ];
    const sampled = sampleWeeklyData(data, 'dv_ttm');
    expect(sampled.length).toBe(1);
    expect(sampled[0].sampleDate).toBe('2024-06-07');
    expect(sampled[0].price).toBe(102);
  });

  it('should fallback to Thursday if Friday unavailable', () => {
    const data: DailyData[] = [
      { trade_date: '2024-06-03', close: 100 }, // Mon
      { trade_date: '2024-06-06', close: 101 }, // Thu
    ];
    const sampled = sampleWeeklyData(data, 'dv_ttm');
    expect(sampled.length).toBe(1);
    expect(sampled[0].sampleDate).toBe('2024-06-06');
    expect(sampled[0].price).toBe(101);
  });

  it('should fallback to earlier day if Thu/Fri unavailable', () => {
    const data: DailyData[] = [
      { trade_date: '2024-06-03', close: 100 }, // Mon
      { trade_date: '2024-06-04', close: 105 }, // Tue
    ];
    const sampled = sampleWeeklyData(data, 'dv_ttm');
    expect(sampled.length).toBe(1);
    expect(sampled[0].sampleDate).toBe('2024-06-04');
    expect(sampled[0].price).toBe(105);
  });

  it('should gracefully handle missing dividend yield', () => {
    const data: DailyData[] = [
      { trade_date: '2024-06-07', close: 102 }, // Fri
    ];
    const sampled = sampleWeeklyData(data, 'dv_ratio');
    expect(sampled[0].dividendYield).toBeNull();
  });
});
