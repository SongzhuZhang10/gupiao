import { describe, expect, it } from 'vitest';
import { resolveEffectiveGrahamYears } from '../src/utils/grahamYearRange';

describe('resolveEffectiveGrahamYears', () => {
  const history = [
    { year: 2021, adjustedEps: 1.2 },
    { year: 2022, adjustedEps: 1.5 },
    { year: 2023, adjustedEps: 1.8 },
  ];

  it('returns requested years when both exist with positive EPS', () => {
    const result = resolveEffectiveGrahamYears(history, 2021, 2023);
    expect(result).toEqual({
      startYear: 2021,
      endYear: 2023,
      adjusted: false,
      messages: [],
    });
  });

  it('clamps startYear to earliest positive EPS year', () => {
    const result = resolveEffectiveGrahamYears(history, 2019, 2023);
    expect(result.startYear).toBe(2021);
    expect(result.endYear).toBe(2023);
    expect(result.adjusted).toBe(true);
    expect(result.messages[0]).toContain('2019');
    expect(result.messages[0]).toContain('2021');
  });

  it('clamps endYear to latest positive EPS year on or before request', () => {
    const result = resolveEffectiveGrahamYears(history, 2021, 2025);
    expect(result.startYear).toBe(2021);
    expect(result.endYear).toBe(2023);
    expect(result.adjusted).toBe(true);
    expect(result.messages.some(m => m.includes('2025'))).toBe(true);
  });

  it('throws when no positive EPS exists', () => {
    expect(() =>
      resolveEffectiveGrahamYears([{ year: 2022, adjustedEps: -0.5 }], 2020, 2023)
    ).toThrow('无可用正 EPS 年份');
  });

  it('clamps both start and end years when both are out of range', () => {
    const result = resolveEffectiveGrahamYears(history, 2019, 2025);
    expect(result.startYear).toBe(2021);
    expect(result.endYear).toBe(2023);
    expect(result.adjusted).toBe(true);
    expect(result.messages).toHaveLength(2);
  });

  it('throws when requested start year falls in a gap inside history', () => {
    const gappedHistory = [
      { year: 2021, adjustedEps: 1.2 },
      { year: 2023, adjustedEps: 1.8 },
    ];
    expect(() => resolveEffectiveGrahamYears(gappedHistory, 2022, 2023)).toThrow(
      '缺少 2022 年扣非 EPS 数据'
    );
  });
  it('throws when requested end year is earlier than all available EPS data', () => {
    expect(() => resolveEffectiveGrahamYears(history, 2017, 2018)).toThrow(
      '缺少 2018 年及之前'
    );
  });

  it('treats EPS=0 as missing data', () => {
    expect(() =>
      resolveEffectiveGrahamYears([{ year: 2022, adjustedEps: 0 }], 2020, 2023)
    ).toThrow('无可用正 EPS 年份');
  });
});
