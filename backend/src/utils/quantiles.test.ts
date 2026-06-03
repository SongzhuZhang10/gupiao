import { describe, it, expect } from 'vitest';
import { calculateQuantiles, classifyZone } from './quantiles';

describe('quantiles utilities', () => {
  it('should calculate quantiles correctly for a small sorted array', () => {
    const values = [1, 2, 3, 4, 5];
    const q = calculateQuantiles(values);
    // index for p=0.2 is 4 * 0.2 = 0.8 -> lower=0, upper=1, weight=0.8
    // q20 = 1 * 0.2 + 2 * 0.8 = 1.8
    expect(q.q20).toBeCloseTo(1.8);
    // p=0.4: idx = 1.6 -> 2 * 0.4 + 3 * 0.6 = 2.6
    expect(q.q40).toBeCloseTo(2.6);
    // p=0.6: idx = 2.4 -> 3 * 0.6 + 4 * 0.4 = 3.4
    expect(q.q60).toBeCloseTo(3.4);
    // p=0.8: idx = 3.2 -> 4 * 0.8 + 5 * 0.2 = 4.2
    expect(q.q80).toBeCloseTo(4.2);
  });

  it('should return 0 when array is empty', () => {
    const q = calculateQuantiles([]);
    expect(q.q20).toBe(0);
    expect(q.q80).toBe(0);
  });

  it('should return same value when array has 1 element', () => {
    const q = calculateQuantiles([5]);
    expect(q.q20).toBe(5);
    expect(q.q80).toBe(5);
  });

  it('should classify zones correctly', () => {
    const quantiles = { q20: 2, q40: 4, q60: 6, q80: 8 };
    expect(classifyZone(9, quantiles)).toBe('strong_buy');
    expect(classifyZone(8, quantiles)).toBe('strong_buy');
    expect(classifyZone(7, quantiles)).toBe('add');
    expect(classifyZone(6, quantiles)).toBe('add');
    expect(classifyZone(5, quantiles)).toBe('hold');
    expect(classifyZone(4, quantiles)).toBe('hold');
    expect(classifyZone(3, quantiles)).toBe('reduce');
    expect(classifyZone(2, quantiles)).toBe('reduce');
    expect(classifyZone(1, quantiles)).toBe('exit');
  });
});
