import { describe, it, expect } from 'vitest';
import { resolveValidClosingPrice, getBeijingTimeContext } from '../src/services/graham/closingPriceRules';

describe('closingPriceRules', () => {
  describe('getBeijingTimeContext', () => {
    it('should correctly convert to Beijing Time', () => {
      // 2026-06-16T06:00:00.000Z is 14:00:00 Beijing Time
      const ms = Date.UTC(2026, 5, 16, 6, 0, 0); // Month is 0-indexed, so 5 = June
      const { currentDate, currentHour } = getBeijingTimeContext(ms);
      expect(currentDate).toBe('2026-06-16');
      expect(currentHour).toBe(14);
    });

    it('should correctly convert to Beijing Time across days', () => {
      // 2026-06-16T18:00:00.000Z is 02:00:00 next day Beijing Time (June 17)
      const ms = Date.UTC(2026, 5, 16, 18, 0, 0);
      const { currentDate, currentHour } = getBeijingTimeContext(ms);
      expect(currentDate).toBe('2026-06-17');
      expect(currentHour).toBe(2);
    });
  });

  describe('resolveValidClosingPrice', () => {
    const records = [
      { date: '2026-06-15', close: 100 },
      { date: '2026-06-16', close: 105 }
    ];

    it('should return previous record if today is trading day and time < 15:00', () => {
      // 2026-06-16T06:00:00.000Z => 14:00 Beijing Time
      const ms = Date.UTC(2026, 5, 16, 6, 0, 0);
      const result = resolveValidClosingPrice(records, r => r.date, ms);
      expect(result).toEqual({ date: '2026-06-15', close: 100 });
    });

    it('should return latest record if today is trading day and time >= 15:00', () => {
      // 2026-06-16T07:30:00.000Z => 15:30 Beijing Time
      const ms = Date.UTC(2026, 5, 16, 7, 30, 0);
      const result = resolveValidClosingPrice(records, r => r.date, ms);
      expect(result).toEqual({ date: '2026-06-16', close: 105 });
    });

    it('should return latest record if it is a holiday (latest record is not today)', () => {
      // 2026-06-17T06:00:00.000Z => 14:00 Beijing Time on June 17 (holiday, latest record is June 16)
      const ms = Date.UTC(2026, 5, 17, 6, 0, 0);
      const result = resolveValidClosingPrice(records, r => r.date, ms);
      expect(result).toEqual({ date: '2026-06-16', close: 105 });
    });

    it('should handle single record arrays properly', () => {
      // Even if < 15:00 on the same day, if there is no previous record to fall back to, we must return the latest
      const ms = Date.UTC(2026, 5, 16, 6, 0, 0);
      const singleRecord = [{ date: '2026-06-16', close: 105 }];
      const result = resolveValidClosingPrice(singleRecord, r => r.date, ms);
      expect(result).toEqual({ date: '2026-06-16', close: 105 });
    });

    it('should return undefined for empty arrays', () => {
      expect(resolveValidClosingPrice([], r => r.date)).toBeUndefined();
    });
  });
});
