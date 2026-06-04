export interface DailyData {
  trade_date: string; // YYYY-MM-DD
  close?: number; // chart close, adjusted according to priceMode when requested
  unadjusted_close?: number; // raw close used as the dividend yield denominator
  adj_factor?: number; // for calculating forward/backward adjusted prices
  dividend_yield?: number; // dv_ratio or dv_ttm
}

export interface SampledPoint {
  week: string; // e.g. 2024-W23
  sampleDate: string; // YYYY-MM-DD
  price: number;
  dividendYield: number | null;
  dividendYieldMode: string;
}

/**
 * Get ISO week string for a given date string (YYYY-MM-DD)
 */
export function getISOWeek(dateString: string): string {
  const date = new Date(dateString);
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const year = target.getFullYear();
  return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}

export function sampleWeeklyData(
  dailyDataList: DailyData[],
  dividendYieldMode: 'dv_ratio' | 'dv_ttm'
): SampledPoint[] {
  // Sort data chronologically to be safe
  const sortedData = [...dailyDataList].sort((a, b) => a.trade_date.localeCompare(b.trade_date));

  // Group by ISO week
  const groupedByWeek: Record<string, DailyData[]> = {};
  for (const data of sortedData) {
    const week = getISOWeek(data.trade_date);
    if (!groupedByWeek[week]) {
      groupedByWeek[week] = [];
    }
    groupedByWeek[week].push(data);
  }

  const result: SampledPoint[] = [];

  const weekKeys = Object.keys(groupedByWeek).sort();
  for (const week of weekKeys) {
    const weekData = groupedByWeek[week];
    // Find the best day in the week: Fri (5), Thu (4), Wed (3), Tue (2), Mon (1)
    let bestDay: DailyData | null = null;
    let bestDayIndex = -1; // We want 5, then 4, etc.

    for (const data of weekData) {
      const dateObj = new Date(data.trade_date);
      let dayOfWeek = dateObj.getDay();
      if (dayOfWeek === 0) dayOfWeek = 7; // Sunday is 7

      if (dayOfWeek <= 5) {
        if (!bestDay || dayOfWeek > bestDayIndex) {
          bestDay = data;
          bestDayIndex = dayOfWeek;
        }
      }
    }

    if (bestDay) {
      // priceMode is handled elsewhere by pre-adjusting the `close` field before sampling, or we assume `close` here is already adjusted
      result.push({
        week,
        sampleDate: bestDay.trade_date,
        price: bestDay.close ?? 0,
        dividendYield: bestDay.dividend_yield ?? null,
        dividendYieldMode,
      });
    }
  }

  return result;
}
