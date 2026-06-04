export type DisplayMode = 'both' | 'dividend' | 'price';
export type ZoneId = 'strong_buy' | 'add' | 'hold' | 'reduce' | 'exit';

export interface DataPoint {
  week: string;
  sampleDate: string;
  price: number;
  dividendYield: number | null;
  dividendYieldMode: string;
}

export interface SourceMetadataSummary {
  logical_source: string;
  access_layer: string;
  fallback_used: boolean;
  source_priority_rank: number;
  quality_flags?: string[];
}

export interface ApiResponse {
  stockCode: string;
  startDate: string;
  endDate: string;
  dataSource?: string;
  sourceMetadata?: SourceMetadataSummary;
  warnings?: string[];
  samplingRule: string;
  points: DataPoint[];
}

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

export interface DividendYieldZoneResponse {
  code: string;
  chartStartDate: string;
  chartEndDate: string;
  thresholdWindowStart: string;
  thresholdWindowEnd: string;
  lookbackYears: number;
  dividendBasis: 'pre_tax';
  quantiles: {
    q20: number;
    q40: number;
    q60: number;
    q80: number;
  };
  zones: DividendYieldZone[];
  samples: DividendYieldZoneSample[];
  stats: DividendYieldZoneStat[];
  warnings: string[];
  dataSource?: string;
  sourceMetadata?: SourceMetadataSummary;
}

interface BuildCombinedChartOptionInput {
  data: ApiResponse;
  zonesData: DividendYieldZoneResponse | null;
  displayMode: DisplayMode;
  showZones: boolean;
  zonesError: string | null;
}

const ZONE_COLORS: Record<ZoneId, string> = {
  strong_buy: 'rgba(74, 222, 128, 0.30)',
  add: 'rgba(45, 212, 191, 0.30)',
  hold: 'rgba(203, 213, 225, 0.18)',
  reduce: 'rgba(245, 158, 11, 0.24)',
  exit: 'rgba(220, 38, 38, 0.24)',
};

const CHART_BACKGROUND = '#0f172a';
const CHART_SURFACE = '#111827';
const CHART_TEXT = '#cbd5e1';
const CHART_MUTED_TEXT = '#94a3b8';
const CHART_GRID_LINE = 'rgba(148, 163, 184, 0.18)';

function formatNumber(value: number | null | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function formatDateValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }
  return '';
}

function seriesValue(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (Array.isArray(value) && typeof value[1] === 'number') return value[1];
  return null;
}

function tooltipDate(param: any): string {
  if (Array.isArray(param?.value) && typeof param.value[0] === 'string') return param.value[0];
  return formatDateValue(param?.axisValue);
}

function zoneLabel(zonesData: DividendYieldZoneResponse, zoneId: ZoneId): string {
  if (zoneId === 'exit') return '清仓区';
  return zonesData.zones.find(zone => zone.id === zoneId)?.label ?? zoneId;
}

function buildZoneLegendSeries(zonesData: DividendYieldZoneResponse) {
  return zonesData.zones.map(zone => ({
    name: zoneLabel(zonesData, zone.id),
    type: 'line',
    yAxisIndex: 1,
    data: [],
    symbol: 'none',
    lineStyle: { opacity: 0 },
    itemStyle: { color: ZONE_COLORS[zone.id] },
    tooltip: { show: false },
  }));
}

function buildVerticalZoneMarkAreas(zonesData: DividendYieldZoneResponse) {
  const sortedSamples = [...zonesData.samples].sort((a, b) => a.date.localeCompare(b.date));
  if (sortedSamples.length === 0) return [];

  const areas = [];
  let currentStart = sortedSamples[0];
  let previous = sortedSamples[0];

  for (const sample of sortedSamples.slice(1)) {
    if (sample.zoneId !== previous.zoneId) {
      areas.push([
        {
          xAxis: currentStart.date,
          itemStyle: { color: ZONE_COLORS[currentStart.zoneId] },
          name: zoneLabel(zonesData, currentStart.zoneId),
        },
        { xAxis: previous.date },
      ]);
      currentStart = sample;
    }
    previous = sample;
  }

  areas.push([
    {
      xAxis: currentStart.date,
      itemStyle: { color: ZONE_COLORS[currentStart.zoneId] },
      name: zoneLabel(zonesData, currentStart.zoneId),
    },
    { xAxis: previous.date },
  ]);

  return areas;
}

export function buildCombinedChartOption({
  data,
  zonesData,
  displayMode,
  showZones,
  zonesError,
}: BuildCombinedChartOptionInput): any {
  const canRenderZones = Boolean(showZones && zonesData && !zonesError && displayMode !== 'price');
  const zoneLegendNames = canRenderZones && zonesData ? zonesData.zones.map(zone => zoneLabel(zonesData, zone.id)) : [];

  return {
    backgroundColor: CHART_BACKGROUND,
    title: {
      text: '股价与股息率综合走势图',
      left: 'center',
      textStyle: { color: '#e5e7eb', fontWeight: 600 },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.94)',
      borderColor: 'rgba(148, 163, 184, 0.28)',
      textStyle: { color: '#e5e7eb' },
      formatter: function (params: any) {
        const items = Array.isArray(params) ? params : [params];
        const displayDate = items[0]?.axisValueLabel || tooltipDate(items[0]) || formatDateValue(items[0]?.axisValue);
        let result = `<div><b>${displayDate}</b></div>`;
        let priceStr = '';
        let divStr = '';
        const sampleMap = new Map<string, DividendYieldZoneSample>();
        if (zonesData?.samples) {
          zonesData.samples.forEach(sample => sampleMap.set(sample.date, sample));
        }

        items.forEach((param: any) => {
          if (param.seriesName === '股价') {
            priceStr = `<div>${param.marker} 股价: ${formatNumber(seriesValue(param.value))}</div>`;
          } else if (param.seriesName === '股息率') {
            const date = tooltipDate(param);
            const zoneSample = sampleMap.get(date);
            divStr = `<div>${param.marker} 股息率: ${formatNumber(seriesValue(param.value))}%</div>`;
            if (zoneSample && zonesData) {
              divStr += `<div style="font-size:12px;color:${CHART_MUTED_TEXT}">&nbsp;&nbsp;TTM 每股现金分红: ${formatNumber(zoneSample.ttmDividendPerShare)}</div>`;
              divStr += `<div style="font-size:12px;color:${CHART_MUTED_TEXT}">&nbsp;&nbsp;未复权收盘价: ${formatNumber(zoneSample.close)}</div>`;
              divStr += `<div style="font-size:12px;color:${CHART_MUTED_TEXT}">&nbsp;&nbsp;操作区间: ${zoneLabel(zonesData, zoneSample.zoneId)}</div>`;
              divStr += `<div style="font-size:12px;color:${CHART_MUTED_TEXT}">&nbsp;&nbsp;阈值: q20=${formatNumber(zonesData.quantiles.q20)}%, q40=${formatNumber(zonesData.quantiles.q40)}%, q60=${formatNumber(zonesData.quantiles.q60)}%, q80=${formatNumber(zonesData.quantiles.q80)}%</div>`;
            }
          }
        });
        return result + priceStr + divStr;
      },
    },
    legend: {
      show: true,
      selectedMode: false,
      left: 'left',
      top: 0,
      textStyle: { color: CHART_TEXT },
      data: ['股价', '股息率', ...zoneLegendNames],
      selected: {
        股价: displayMode === 'both' || displayMode === 'price',
        股息率: displayMode === 'both' || displayMode === 'dividend',
      },
    },
    xAxis: {
      type: 'time',
      name: '日期',
      axisLabel: { color: CHART_MUTED_TEXT },
      nameTextStyle: { color: CHART_MUTED_TEXT },
      axisLine: { lineStyle: { color: CHART_GRID_LINE } },
      splitLine: { lineStyle: { color: CHART_GRID_LINE } },
    },
    yAxis: [
      {
        type: 'value',
        name: '价格 (元)',
        position: 'left',
        alignTicks: true,
        scale: true,
        axisLabel: { color: CHART_MUTED_TEXT },
        nameTextStyle: { color: CHART_MUTED_TEXT },
        splitLine: { lineStyle: { color: CHART_GRID_LINE } },
        axisLine: { show: true, lineStyle: { color: '#5470C6' } },
      },
      {
        type: 'value',
        name: '收益率 (%)',
        position: 'right',
        alignTicks: true,
        scale: true,
        axisLabel: { formatter: '{value}%', color: CHART_MUTED_TEXT },
        nameTextStyle: { color: CHART_MUTED_TEXT },
        splitLine: { lineStyle: { color: 'rgba(47, 158, 68, 0.14)' } },
        axisLine: { show: true, lineStyle: { color: '#2f9e44' } },
      },
    ],
    dataZoom: [
      { type: 'inside' },
      {
        type: 'slider',
        borderColor: 'rgba(148, 163, 184, 0.18)',
        backgroundColor: CHART_SURFACE,
        fillerColor: 'rgba(59, 130, 246, 0.22)',
        dataBackground: {
          lineStyle: { color: 'rgba(148, 163, 184, 0.35)' },
          areaStyle: { color: 'rgba(148, 163, 184, 0.10)' },
        },
        selectedDataBackground: {
          lineStyle: { color: 'rgba(96, 165, 250, 0.55)' },
          areaStyle: { color: 'rgba(96, 165, 250, 0.18)' },
        },
        textStyle: { color: CHART_MUTED_TEXT },
      },
    ],
    toolbox: {
      iconStyle: { borderColor: CHART_MUTED_TEXT },
      emphasis: { iconStyle: { borderColor: '#e5e7eb' } },
      feature: {
        saveAsImage: {},
      },
    },
    series: [
      {
        name: '股价',
        data: data.points.map(point => [point.sampleDate, point.price]),
        type: 'line',
        smooth: true,
        yAxisIndex: 0,
        itemStyle: { color: '#5470C6' },
      },
      {
        name: '股息率',
        data: data.points.map(point => [point.sampleDate, point.dividendYield]),
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        connectNulls: false,
        itemStyle: { color: '#2f9e44' },
        markArea: canRenderZones && zonesData ? {
          silent: true,
          data: buildVerticalZoneMarkAreas(zonesData),
        } : undefined,
      },
      ...(canRenderZones && zonesData ? buildZoneLegendSeries(zonesData) : []),
    ],
  };
}
