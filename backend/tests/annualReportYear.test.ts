import { describe, expect, it } from 'vitest';
import { annualReportYearFromAsOfDate } from '../src/utils/annualReportYear';

describe('annualReportYearFromAsOfDate', () => {
  it('maps NVDA Jan fiscal year-end to prior calendar report year', () => {
    expect(annualReportYearFromAsOfDate('2024-01-31')).toBe(2023);
    expect(annualReportYearFromAsOfDate('2026-01-31')).toBe(2025);
  });

  it('maps Apple Sep fiscal year-end to same calendar report year', () => {
    expect(annualReportYearFromAsOfDate('2023-09-30')).toBe(2023);
  });

  it('maps December fiscal year-end to same calendar report year', () => {
    expect(annualReportYearFromAsOfDate('2023-12-31')).toBe(2023);
  });

  it('maps June fiscal year-end to same calendar report year', () => {
    expect(annualReportYearFromAsOfDate('2023-06-30')).toBe(2023);
  });

  it('maps May fiscal year-end to prior calendar report year', () => {
    expect(annualReportYearFromAsOfDate('2024-05-31')).toBe(2023);
  });
});
