import { describe, expect, it } from 'vitest';
import { buildCombinedChartOption, type ApiResponse, type DividendYieldZoneResponse } from './chartOptions';

const historyData: ApiResponse = {
  stockCode: '600519.SH',
  startDate: '2024-01-01',
  endDate: '2024-01-12',
  samplingRule: 'fixture',
  points: [
    {
      week: '2024-W01',
      sampleDate: '2024-01-05',
      price: 100,
      dividendYield: 3.2,
      dividendYieldMode: 'dv_ttm',
    },
  ],
};

const zonesData: DividendYieldZoneResponse = {
  code: '600519.SH',
  chartStartDate: '2024-01-01',
  chartEndDate: '2024-01-12',
  thresholdWindowStart: '2019-01-12',
  thresholdWindowEnd: '2024-01-12',
  lookbackYears: 5,
  dividendBasis: 'pre_tax',
  quantiles: { q20: 1, q40: 2, q60: 3, q80: 4 },
  zones: [
    { id: 'strong_buy', label: '重仓买入区', operation: '高股息率', percentileRange: '80% ~ 100%', yMin: 4, yMax: null },
    { id: 'add', label: '分批加仓区', operation: '偏高', percentileRange: '60% ~ 80%', yMin: 3, yMax: 4 },
    { id: 'hold', label: '持有区', operation: '中性', percentileRange: '40% ~ 60%', yMin: 2, yMax: 3 },
    { id: 'reduce', label: '逐步减仓区', operation: '偏低', percentileRange: '20% ~ 40%', yMin: 1, yMax: 2 },
    { id: 'exit', label: '清仓 / 退出区', operation: '极低', percentileRange: '0% ~ 20%', yMin: null, yMax: 1 },
  ],
  samples: [
    {
      date: '2024-01-05',
      close: 100,
      ttmDividendPerShare: 3.2,
      dividendYield: 3.2,
      zoneId: 'add',
    },
  ],
  stats: [],
  warnings: [],
};

describe('buildCombinedChartOption', () => {
  it('adds all five zone labels to the legend and renders five horizontal mark areas', () => {
    const option = buildCombinedChartOption({
      data: historyData,
      zonesData,
      displayMode: 'both',
      showZones: true,
      zonesError: null,
    });

    expect(option.legend.data).toEqual([
      '股价',
      '股息率',
      '重仓买入区',
      '分批加仓区',
      '持有区',
      '逐步减仓区',
      '清仓 / 退出区',
    ]);
    expect(option.series[1].markArea.data).toHaveLength(5);
  });

  it('does not render zone mark areas when only the price series is visible', () => {
    const option = buildCombinedChartOption({
      data: historyData,
      zonesData,
      displayMode: 'price',
      showZones: true,
      zonesError: null,
    });

    expect(option.series[1].markArea).toBeUndefined();
  });

  it('does not render zone mark areas when the zone switch is off', () => {
    const option = buildCombinedChartOption({
      data: historyData,
      zonesData,
      displayMode: 'both',
      showZones: false,
      zonesError: null,
    });

    expect(option.series[1].markArea).toBeUndefined();
  });

  it('shows TTM dividend details, zone label, and quantiles in the dividend tooltip', () => {
    const option = buildCombinedChartOption({
      data: historyData,
      zonesData,
      displayMode: 'dividend',
      showZones: true,
      zonesError: null,
    });
    const tooltip = option.tooltip.formatter([
      {
        axisValue: '2024-01-05',
        seriesName: '股息率',
        value: 3.2,
        marker: '<span></span>',
      },
    ]);

    expect(tooltip).toContain('TTM 每股现金分红: 3.20');
    expect(tooltip).toContain('未复权收盘价: 100.00');
    expect(tooltip).toContain('操作区间: 分批加仓区');
    expect(tooltip).toContain('q20=1.00%');
    expect(tooltip).toContain('q80=4.00%');
  });
});
