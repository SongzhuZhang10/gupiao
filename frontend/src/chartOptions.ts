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
  strong_buy: 'rgba(0, 117, 63, 0.18)',
  add: 'rgba(78, 184, 92, 0.15)',
  hold: 'rgba(96, 125, 139, 0.13)',
  reduce: 'rgba(245, 145, 32, 0.15)',
  exit: 'rgba(224, 67, 54, 0.15)',
};

function formatNumber(value: number | null | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function zoneLabel(zonesData: DividendYieldZoneResponse, zoneId: ZoneId): string {
  return zonesData.zones.find(zone => zone.id === zoneId)?.label ?? zoneId;
}

function buildZoneLegendSeries(zonesData: DividendYieldZoneResponse) {
  return zonesData.zones.map(zone => ({
    name: zone.label,
    type: 'line',
    yAxisIndex: 1,
    data: [],
    symbol: 'none',
    lineStyle: { opacity: 0 },
    itemStyle: { color: ZONE_COLORS[zone.id] },
    tooltip: { show: false },
  }));
}

export function buildCombinedChartOption({
  data,
  zonesData,
  displayMode,
  showZones,
  zonesError,
}: BuildCombinedChartOptionInput): any {
  const canRenderZones = Boolean(showZones && zonesData && !zonesError && displayMode !== 'price');
  const zoneLegendNames = canRenderZones && zonesData ? zonesData.zones.map(zone => zone.label) : [];

  return {
    title: { text: '股价与股息率综合走势图', left: 'center' },
    tooltip: {
      trigger: 'axis',
      formatter: function (params: any) {
        const items = Array.isArray(params) ? params : [params];
        let result = `<div><b>${items[0]?.axisValue ?? ''}</b></div>`;
        let priceStr = '';
        let divStr = '';
        const sampleMap = new Map<string, DividendYieldZoneSample>();
        if (zonesData?.samples) {
          zonesData.samples.forEach(sample => sampleMap.set(sample.date, sample));
        }

        items.forEach((param: any) => {
          if (param.seriesName === '股价') {
            priceStr = `<div>${param.marker} 股价: ${formatNumber(param.value)}</div>`;
          } else if (param.seriesName === '股息率') {
            const date = param.axisValue;
            const zoneSample = sampleMap.get(date);
            divStr = `<div>${param.marker} 股息率: ${formatNumber(param.value)}%</div>`;
            if (zoneSample && zonesData) {
              divStr += `<div style="font-size:12px;color:#666">&nbsp;&nbsp;TTM 每股现金分红: ${formatNumber(zoneSample.ttmDividendPerShare)}</div>`;
              divStr += `<div style="font-size:12px;color:#666">&nbsp;&nbsp;未复权收盘价: ${formatNumber(zoneSample.close)}</div>`;
              divStr += `<div style="font-size:12px;color:#666">&nbsp;&nbsp;操作区间: ${zoneLabel(zonesData, zoneSample.zoneId)}</div>`;
              divStr += `<div style="font-size:12px;color:#666">&nbsp;&nbsp;阈值: q20=${formatNumber(zonesData.quantiles.q20)}%, q40=${formatNumber(zonesData.quantiles.q40)}%, q60=${formatNumber(zonesData.quantiles.q60)}%, q80=${formatNumber(zonesData.quantiles.q80)}%</div>`;
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
      data: ['股价', '股息率', ...zoneLegendNames],
      selected: {
        股价: displayMode === 'both' || displayMode === 'price',
        股息率: displayMode === 'both' || displayMode === 'dividend',
      },
    },
    xAxis: {
      type: 'category',
      data: data.points.map(point => point.sampleDate),
      name: '日期',
    },
    yAxis: [
      {
        type: 'value',
        name: '价格 (元)',
        position: 'left',
        alignTicks: true,
        scale: true,
        axisLine: { show: true, lineStyle: { color: '#5470C6' } },
      },
      {
        type: 'value',
        name: '收益率 (%)',
        position: 'right',
        alignTicks: true,
        scale: true,
        axisLabel: { formatter: '{value}%' },
        axisLine: { show: true, lineStyle: { color: '#2f9e44' } },
      },
    ],
    dataZoom: [{ type: 'inside' }, { type: 'slider' }],
    toolbox: {
      feature: {
        saveAsImage: {},
      },
    },
    series: [
      {
        name: '股价',
        data: data.points.map(point => point.price),
        type: 'line',
        smooth: true,
        yAxisIndex: 0,
        itemStyle: { color: '#5470C6' },
      },
      {
        name: '股息率',
        data: data.points.map(point => point.dividendYield),
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        connectNulls: false,
        itemStyle: { color: '#2f9e44' },
        markArea: canRenderZones && zonesData ? {
          silent: true,
          data: zonesData.zones.map(zone => [
            {
              yAxis: zone.yMin !== null ? zone.yMin : 'min',
              itemStyle: { color: ZONE_COLORS[zone.id] },
              name: zone.label,
              label: {
                position: 'insideRight',
                color: 'rgba(0,0,0,0.48)',
                fontSize: 12,
              },
            },
            { yAxis: zone.yMax !== null ? zone.yMax : 'max' },
          ]),
        } : undefined,
      },
      ...(canRenderZones && zonesData ? buildZoneLegendSeries(zonesData) : []),
    ],
  };
}
