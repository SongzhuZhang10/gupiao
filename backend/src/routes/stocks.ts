import { Router } from 'express';
import { normalizeStockCode } from '../utils/stock';
import { fetchHistoricalDataWithMeta } from '../services/dataSources';
import { sampleWeeklyData } from '../utils/sampling';
import { calculateQuantiles, classifyZone, ZoneId } from '../utils/quantiles';
import { ProviderFallbackError } from '../services/providers/types';

const router = Router();

router.get('/:tsCode/history', async (req, res) => {
  try {
    const rawCode = req.params.tsCode;
    const { startDate, endDate, priceMode = 'forward', dividendMode = 'dv_ttm' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: '开始日期和结束日期不能为空' });
    }

    const tsCode = normalizeStockCode(rawCode);

    const historicalResult = await fetchHistoricalDataWithMeta(
      tsCode,
      startDate as string,
      endDate as string,
      priceMode as string,
      dividendMode as string
    );

    const sampledData = sampleWeeklyData(historicalResult.data, dividendMode as 'dv_ratio' | 'dv_ttm');

    res.json({
      stockCode: tsCode,
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
    const { startDate, endDate, lookbackYears = '10', dividendBasis = 'pre_tax' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: '开始日期和结束日期不能为空' });
    }

    const chartEndDate = new Date(endDate as string);
    if (isNaN(chartEndDate.getTime())) {
      return res.status(400).json({ error: '结束日期格式无效' });
    }

    const chartStartDate = new Date(startDate as string);
    if (isNaN(chartStartDate.getTime()) || chartEndDate < chartStartDate) {
      return res.status(400).json({ error: '开始日期格式无效或晚于结束日期' });
    }

    const years = parseInt(lookbackYears as string, 10);
    const thresholdWindowEnd = endDate as string;
    
    // thresholdWindowStart = chartEndDate 向前推 lookbackYears 个自然年
    const thresholdStartObj = new Date(chartEndDate);
    thresholdStartObj.setFullYear(thresholdStartObj.getFullYear() - years);
    const thresholdWindowStart = thresholdStartObj.toISOString().split('T')[0];

    const tsCode = normalizeStockCode(rawCode);

    // Fetch data for the threshold window (which is likely larger than the chart window)
    const historicalResult = await fetchHistoricalDataWithMeta(
      tsCode,
      thresholdWindowStart,
      thresholdWindowEnd,
      'unadjusted', // 必须使用未复权收盘价
      'dv_ttm' // TTM股息率
    );
    const dailyData = historicalResult.data;

    // Filter valid samples: has close > 0, has dividend_yield
    const validSamples = dailyData.filter(d => 
      d.close !== undefined && d.close > 0 && d.dividend_yield !== undefined
    );

    if (validSamples.length < 100) {
      return res.status(400).json({ error: '有效股息率样本数量不足，无法计算可靠的分位数操作区间。' });
    }

    const yieldValues = validSamples.map(d => d.dividend_yield as number);
    const quantiles = calculateQuantiles(yieldValues);

    const warnings: string[] = historicalResult.warnings.map(w =>
      historicalResult.dataSource === 'mock' && w.includes('当前数据基于 Mock 数据降级展示')
        ? '真实数据源不可用，当前操作区间基于 Mock 数据降级展示。'
        : w
    );
    const windowDays = (chartEndDate.getTime() - thresholdStartObj.getTime()) / (1000 * 3600 * 24);
    if (windowDays < 5 * 365) {
       // Since the API might be missing data, we check actual sample span
       const firstSampleDate = new Date(validSamples[0].trade_date);
       const lastSampleDate = new Date(validSamples[validSamples.length - 1].trade_date);
       const actualDays = (lastSampleDate.getTime() - firstSampleDate.getTime()) / (1000 * 3600 * 24);
       if (actualDays < 5 * 365) {
         warnings.push("警告：可用的有效股息率数据少于 5 年，分位数区间的可靠性可能较低。");
       }
    }

    const zonesDef = [
      { id: "strong_buy", label: "重仓买入区", operation: "高股息率，股价可能明显低估，适合重仓买入", percentileRange: "80% ~ 100%", yMin: quantiles.q80, yMax: null },
      { id: "add", label: "分批加仓区", operation: "股息率偏高，适合分批低吸加仓", percentileRange: "60% ~ 80%", yMin: quantiles.q60, yMax: quantiles.q80 },
      { id: "hold", label: "持有区", operation: "股息率处于中性区间，持有不动", percentileRange: "40% ~ 60%", yMin: quantiles.q40, yMax: quantiles.q60 },
      { id: "reduce", label: "逐步减仓区", operation: "股息率偏低，适合逐步减仓止盈", percentileRange: "20% ~ 40%", yMin: quantiles.q20, yMax: quantiles.q40 },
      { id: "exit", label: "清仓 / 退出区", operation: "股息率极低，股价可能明显高估，适合清仓或退出", percentileRange: "0% ~ 20%", yMin: null, yMax: quantiles.q20 }
    ];

    let prevZoneId: ZoneId | null = null;
    const statsMap: Record<ZoneId, { count: number, windows: number }> = {
      strong_buy: { count: 0, windows: 0 },
      add: { count: 0, windows: 0 },
      hold: { count: 0, windows: 0 },
      reduce: { count: 0, windows: 0 },
      exit: { count: 0, windows: 0 }
    };

    const samples = validSamples.map(d => {
      const y = d.dividend_yield as number;
      const c = d.close as number;
      const ttmDividend = Number(((y * c) / 100).toFixed(4));
      const zoneId = classifyZone(y, quantiles);
      
      statsMap[zoneId].count++;
      if (zoneId !== prevZoneId) {
        statsMap[zoneId].windows++;
      }
      prevZoneId = zoneId;

      return {
        date: d.trade_date,
        close: c,
        ttmDividendPerShare: ttmDividend,
        dividendYield: y,
        zoneId
      };
    });

    const totalDays = validSamples.length;
    // How many years the data actually covers for average calculation
    const firstSampleDate = new Date(validSamples[0].trade_date);
    const lastSampleDate = new Date(validSamples[validSamples.length - 1].trade_date);
    const actualYears = Math.max(1, (lastSampleDate.getTime() - firstSampleDate.getTime()) / (1000 * 3600 * 24 * 365));

    const stats = zonesDef.map(z => {
      const s = statsMap[z.id as ZoneId];
      return {
        zoneId: z.id,
        label: z.label,
        tradingDays: s.count,
        tradingDayRatio: Number((s.count / totalDays).toFixed(4)),
        averageTradingDaysPerYear: Math.round(s.count / actualYears),
        occurrenceWindows: s.windows
      };
    });

    res.json({
      code: tsCode,
      chartStartDate: startDate,
      chartEndDate: endDate,
      thresholdWindowStart,
      thresholdWindowEnd,
      lookbackYears: years,
      dividendBasis,
      dataSource: historicalResult.dataSource,
      sourceMetadata: historicalResult.sourceMetadata,
      quantiles,
      zones: zonesDef,
      samples,
      stats,
      warnings
    });

  } catch (error) {
    console.error('获取操作区间数据出错', error);
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

export default router;
