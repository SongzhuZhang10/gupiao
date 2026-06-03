import { Router } from 'express';
import { normalizeStockCode } from '../utils/stock';
import { fetchHistoricalData } from '../services/dataSources';
import { sampleWeeklyData } from '../utils/sampling';

const router = Router();

router.get('/:tsCode/history', async (req, res) => {
  try {
    const rawCode = req.params.tsCode;
    const { startDate, endDate, priceMode = 'forward', dividendMode = 'dv_ttm' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: '开始日期和结束日期不能为空' });
    }

    const tsCode = normalizeStockCode(rawCode);

    const dailyData = await fetchHistoricalData(
      tsCode,
      startDate as string,
      endDate as string,
      priceMode as string,
      dividendMode as string
    );

    const sampledData = sampleWeeklyData(dailyData, dividendMode as 'dv_ratio' | 'dv_ttm');

    res.json({
      stockCode: tsCode,
      startDate,
      endDate,
      samplingRule: "基于 ISO 周的分组：周五优先，无数据则回退至周四，直至周一",
      points: sampledData
    });

  } catch (error) {
    console.error('获取历史数据路由出错', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
