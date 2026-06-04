import { DailyBarRecord, DividendEventRecord } from '../services/providers/types';
import { calculateQuantiles, classifyZone, Quantiles, ZoneId } from './quantiles';

export const INSUFFICIENT_SAMPLE_MESSAGE = '有效股息率样本数量不足，无法计算可靠的分位数操作区间。';
export const LOW_COVERAGE_WARNING = '警告：可用的有效股息率数据少于 5 年，分位数区间的可靠性可能较低。';

export type DividendBasis = 'pre_tax';

export interface DividendYieldZone {
  id: ZoneId;
  label: string;
  operation: string;
  percentileRange: string;
  yMin: number | null;
  yMax: number | null;
}

export interface DividendYieldZoneSample {
  date: string;
  close: number;
  ttmDividendPerShare: number;
  dividendYield: number;
  zoneId: ZoneId;
}

export interface DividendYieldZoneStat {
  zoneId: ZoneId;
  label: string;
  tradingDays: number;
  tradingDayRatio: number;
  averageTradingDaysPerYear: number;
  occurrenceWindows: number;
}

type DividendYieldDailyBar = Omit<DailyBarRecord, 'close'> & { close?: number };

export interface CalculateDividendYieldZonesInput {
  dailyBars: DividendYieldDailyBar[];
  dividendEvents: DividendEventRecord[];
  chartStartDate: string;
  chartEndDate: string;
  thresholdWindowStart: string;
  thresholdWindowEnd: string;
  lookbackYears: number;
  dividendBasis: DividendBasis;
  minValidSamples?: number;
  warnings?: string[];
}

export interface DividendYieldZonesCalculation {
  chartStartDate: string;
  chartEndDate: string;
  thresholdWindowStart: string;
  thresholdWindowEnd: string;
  lookbackYears: number;
  dividendBasis: DividendBasis;
  quantiles: Quantiles;
  zones: DividendYieldZone[];
  samples: DividendYieldZoneSample[];
  stats: DividendYieldZoneStat[];
  warnings: string[];
}

const ZONE_META: Array<Omit<DividendYieldZone, 'yMin' | 'yMax'>> = [
  {
    id: 'strong_buy',
    label: '重仓买入区',
    operation: '高股息率，股价可能明显低估，适合重仓买入',
    percentileRange: '80% ~ 100%',
  },
  {
    id: 'add',
    label: '分批加仓区',
    operation: '股息率偏高，适合分批低吸加仓',
    percentileRange: '60% ~ 80%',
  },
  {
    id: 'hold',
    label: '持有区',
    operation: '股息率处于中性区间，持有不动',
    percentileRange: '40% ~ 60%',
  },
  {
    id: 'reduce',
    label: '逐步减仓区',
    operation: '股息率偏低，适合逐步减仓止盈',
    percentileRange: '20% ~ 40%',
  },
  {
    id: 'exit',
    label: '清仓 / 退出区',
    operation: '股息率极低，股价可能明显高估，适合清仓或退出',
    percentileRange: '0% ~ 20%',
  },
];

function utcTime(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getTime();
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function eventDate(event: DividendEventRecord): string | undefined {
  return event.ex_date || event.record_date || event.announcement_date;
}

function calculateTtmDividendPerShare(asOfDate: string, dividendEvents: DividendEventRecord[]): number {
  const asOfTime = utcTime(asOfDate);
  const trailingStart = asOfTime - 365 * 24 * 60 * 60 * 1000;

  const total = dividendEvents.reduce((sum, event) => {
    const date = eventDate(event);
    const time = date ? utcTime(date) : NaN;
    if (!Number.isFinite(time) || time > asOfTime || time <= trailingStart) return sum;
    return sum + (Number.isFinite(event.cash_dividend) ? event.cash_dividend ?? 0 : 0);
  }, 0);

  return round4(total);
}

function zonesFromQuantiles(quantiles: Quantiles): DividendYieldZone[] {
  return [
    { ...ZONE_META[0], yMin: quantiles.q80, yMax: null },
    { ...ZONE_META[1], yMin: quantiles.q60, yMax: quantiles.q80 },
    { ...ZONE_META[2], yMin: quantiles.q40, yMax: quantiles.q60 },
    { ...ZONE_META[3], yMin: quantiles.q20, yMax: quantiles.q40 },
    { ...ZONE_META[4], yMin: null, yMax: quantiles.q20 },
  ];
}

function yearsCovered(samples: DividendYieldZoneSample[]): number {
  if (samples.length < 2) return 0;
  const first = utcTime(samples[0].date);
  const last = utcTime(samples[samples.length - 1].date);
  return (last - first) / (365 * 24 * 60 * 60 * 1000);
}

function calculateStats(samples: DividendYieldZoneSample[], zones: DividendYieldZone[]): DividendYieldZoneStat[] {
  const statsMap: Record<ZoneId, { tradingDays: number; occurrenceWindows: number }> = {
    strong_buy: { tradingDays: 0, occurrenceWindows: 0 },
    add: { tradingDays: 0, occurrenceWindows: 0 },
    hold: { tradingDays: 0, occurrenceWindows: 0 },
    reduce: { tradingDays: 0, occurrenceWindows: 0 },
    exit: { tradingDays: 0, occurrenceWindows: 0 },
  };

  let previousZone: ZoneId | null = null;
  for (const sample of samples) {
    statsMap[sample.zoneId].tradingDays += 1;
    if (sample.zoneId !== previousZone) {
      statsMap[sample.zoneId].occurrenceWindows += 1;
    }
    previousZone = sample.zoneId;
  }

  const total = samples.length;
  const actualYears = Math.max(1, yearsCovered(samples));

  return zones.map(zone => {
    const stat = statsMap[zone.id];
    return {
      zoneId: zone.id,
      label: zone.label,
      tradingDays: stat.tradingDays,
      tradingDayRatio: round4(stat.tradingDays / total),
      averageTradingDaysPerYear: Math.round(stat.tradingDays / actualYears),
      occurrenceWindows: stat.occurrenceWindows,
    };
  });
}

export function calculateDividendYieldZones(input: CalculateDividendYieldZonesInput): DividendYieldZonesCalculation {
  const minValidSamples = input.minValidSamples ?? 100;
  const sortedBars = [...input.dailyBars]
    .filter(bar => bar.trade_date >= input.thresholdWindowStart && bar.trade_date <= input.thresholdWindowEnd)
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date));

  const preQuantileSamples = sortedBars.flatMap(bar => {
    if (bar.close === undefined || !Number.isFinite(bar.close) || bar.close <= 0) return [];

    const ttmDividendPerShare = calculateTtmDividendPerShare(bar.trade_date, input.dividendEvents);
    const dividendYield = round4((ttmDividendPerShare / bar.close) * 100);

    return [{
      date: bar.trade_date,
      close: bar.close,
      ttmDividendPerShare,
      dividendYield,
      zoneId: 'exit' as ZoneId,
    }];
  });

  if (preQuantileSamples.length < minValidSamples) {
    throw new Error(INSUFFICIENT_SAMPLE_MESSAGE);
  }

  const quantiles = calculateQuantiles(preQuantileSamples.map(sample => sample.dividendYield));
  const zones = zonesFromQuantiles(quantiles);
  const samples = preQuantileSamples.map(sample => ({
    ...sample,
    zoneId: classifyZone(sample.dividendYield, quantiles),
  }));
  const warnings = [...(input.warnings ?? [])];

  if (yearsCovered(samples) < 5) {
    warnings.push(LOW_COVERAGE_WARNING);
  }

  return {
    chartStartDate: input.chartStartDate,
    chartEndDate: input.chartEndDate,
    thresholdWindowStart: input.thresholdWindowStart,
    thresholdWindowEnd: input.thresholdWindowEnd,
    lookbackYears: input.lookbackYears,
    dividendBasis: input.dividendBasis,
    quantiles,
    zones,
    samples,
    stats: calculateStats(samples, zones),
    warnings: Array.from(new Set(warnings)),
  };
}
