import { Router } from 'express';
import {
  isValidStockCode,
  normalizeStockCode,
  parseMarketRegion,
  stockCodeErrorForMarket,
} from '../utils/stock';
import { fetchCachedDividendEventsWithMeta, fetchCachedHistoricalDataWithMeta } from '../services/dataSources';
import { sampleWeeklyData } from '../utils/sampling';
import { ProviderFallbackError } from '../services/providers/types';
import { calculateDividendYieldZones, INSUFFICIENT_SAMPLE_MESSAGE } from '../utils/dividendYieldZones';
import { cacheTtlMsFromHours } from '../services/stockCache';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value);
}

function subtractYears(dateString: string, years: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().split('T')[0];
}

function subtractDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().split('T')[0];
}

function isTrueQueryParam(value: unknown): boolean {
  return value === 'true';
}

router.get('/:tsCode/history', async (req, res) => {
  try {
    const rawCode = req.params.tsCode;
    const { startDate, endDate, priceMode = 'forward', dividendMode = 'dv_ttm', allowMockFallback, cacheTtlHours, market: marketQuery, dataSourceOverride } = req.query;
    const market = parseMarketRegion(marketQuery);

    if (!startDate || !endDate) {
      return res.status(400).json({ error: '开始日期和结束日期不能为空' });
    }
    if (!isValidStockCode(rawCode, market)) {
      return res.status(400).json({ error: stockCodeErrorForMarket(market) });
    }

    const tsCode = normalizeStockCode(rawCode, market);

    const historicalResult = await fetchCachedHistoricalDataWithMeta(
      tsCode,
      startDate as string,
      endDate as string,
      priceMode as string,
      dividendMode as string,
      {
        allowMockFallback: isTrueQueryParam(allowMockFallback),
        cacheTtlMs: cacheTtlMsFromHours(cacheTtlHours),
        market,
        dataSourceOverride: dataSourceOverride as any,
      }
    );

    const sampledData = sampleWeeklyData(historicalResult.data, dividendMode as 'dv_ratio' | 'dv_ttm');

    res.json({
      stockCode: tsCode,
      market,
      startDate,
      endDate,
      dataSource: historicalResult.dataSource,
      sourceMetadata: historicalResult.sourceMetadata,
      warnings: historicalResult.warnings,
      samplingRule: "基于 ISO 周的分组：周五优先，无数据则回退至周四，直至周一",
      points: sampledData
    });

  } catch (error) {
    console.error('获取历史数据路由出错', error);
    if (error instanceof ProviderFallbackError) {
      return res.status(502).json({
        error: '所有免费数据源均不可用',
        details: {
          name: error.name,
          dataType: error.dataType,
          symbol: error.symbol,
          attempts: error.attempts,
        },
      });
    }
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/:tsCode/dividend-yield-zones', async (req, res) => {
  try {
    const rawCode = req.params.tsCode;
    const { startDate, endDate, lookbackYears = '10', dividendBasis = 'pre_tax', allowMockFallback, cacheTtlHours, market: marketQuery, dataSourceOverride } = req.query;
    const market = parseMarketRegion(marketQuery);

    if (!startDate || !endDate) {
      return res.status(400).json({ error: '开始日期和结束日期不能为空' });
    }
    if (!isValidDateString(startDate)) {
      return res.status(400).json({ error: '开始日期格式无效' });
    }
    if (!isValidDateString(endDate)) {
      return res.status(400).json({ error: '结束日期格式无效' });
    }
    if ((endDate as string) < (startDate as string)) {
      return res.status(400).json({ error: '结束日期不能早于开始日期' });
    }
    if (dividendBasis !== 'pre_tax') {
      return res.status(400).json({ error: '当前仅支持税前现金分红口径' });
    }

    const years = Number(lookbackYears);
    if (!Number.isInteger(years) || years < 5 || years > 10) {
      return res.status(400).json({ error: 'lookbackYears 必须是 5 到 10 之间的整数' });
    }

    if (!isValidStockCode(rawCode, market)) {
      return res.status(400).json({ error: stockCodeErrorForMarket(market) });
    }
    const tsCode = normalizeStockCode(rawCode, market);

    const chartStartDate = startDate as string;
    const chartEndDate = endDate as string;
    const thresholdWindowStart = subtractYears(chartEndDate, years);
    const thresholdWindowEnd = chartEndDate;
    const dividendEventStart = subtractDays(thresholdWindowStart, 365);

    const cacheOptions = {
      allowMockFallback: isTrueQueryParam(allowMockFallback),
      cacheTtlMs: cacheTtlMsFromHours(cacheTtlHours),
      market,
      dataSourceOverride: dataSourceOverride as any,
    };

    const historicalResult = await fetchCachedHistoricalDataWithMeta(
      tsCode,
      thresholdWindowStart,
      thresholdWindowEnd,
      'unadjusted',
      'dv_ttm',
      cacheOptions
    );

    const dividendResult = await fetchCachedDividendEventsWithMeta(
      tsCode,
      dividendEventStart,
      thresholdWindowEnd,
      cacheOptions
    );

    const warnings: string[] = historicalResult.warnings.map(w =>
      historicalResult.dataSource === 'mock' && w.includes('当前数据基于 Mock 数据降级展示')
        ? '真实数据源不可用，当前操作区间基于 Mock 数据降级展示。'
        : w
    );
    warnings.push(...dividendResult.warnings.map(w =>
      dividendResult.dataSource === 'mock' && w.includes('Mock')
        ? '真实分红事件源不可用，当前操作区间基于 Mock 分红事件降级展示。'
        : w
    ));

    const calculation = calculateDividendYieldZones({
      dailyBars: historicalResult.data,
      dividendEvents: dividendResult.data,
      chartStartDate,
      chartEndDate,
      thresholdWindowStart,
      thresholdWindowEnd,
      lookbackYears: years,
      dividendBasis: 'pre_tax',
      warnings,
    });

    res.json({
      code: tsCode,
      market,
      ...calculation,
      dataSource: historicalResult.dataSource,
      dividendDataSource: dividendResult.dataSource,
      sourceMetadata: historicalResult.sourceMetadata,
    });

  } catch (error) {
    console.error('获取操作区间数据出错', error);
    if (error instanceof ProviderFallbackError) {
      if (error.dataType === 'dividend_events') {
        return res.status(502).json({
          error: '无法获取分红数据，暂不能计算股息率操作区间',
          details: {
            name: error.name,
            dataType: error.dataType,
            symbol: error.symbol,
            attempts: error.attempts,
          },
        });
      }
      return res.status(502).json({
        error: error.dataType === 'daily_bars' ? '无法获取股价数据' : '所有免费数据源均不可用',
        details: {
          name: error.name,
          dataType: error.dataType,
          symbol: error.symbol,
          attempts: error.attempts,
        },
      });
    }
    if (error instanceof Error && error.message === INSUFFICIENT_SAMPLE_MESSAGE) {
      return res.status(400).json({ error: INSUFFICIENT_SAMPLE_MESSAGE });
    }
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
