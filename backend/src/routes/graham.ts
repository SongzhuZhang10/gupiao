import { Router } from 'express';
import {
  GrahamValuationInput,
  ValuationRow,
  validateInput,
  computeCagrR,
  computeGrahamPrice,
  computePriceDeviation
} from '../utils/grahamValuation';
import { MockGrahamDataProvider } from '../services/grahamDataProvider';
import { isValidAShareStockCode, normalizeStockCode } from '../utils/stock';

const router = Router();
const dataProvider = new MockGrahamDataProvider(); // Replace with real provider later

router.post('/evaluate', async (req, res) => {
  try {
    const inputs: GrahamValuationInput[] = req.body.inputs;
    if (!Array.isArray(inputs)) {
      return res.status(400).json({ error: 'inputs 必须是一个数组' });
    }

    const rows: ValuationRow[] = [];

    for (const rawInput of inputs) {
      let status: ValuationRow['status'] = 'OK';
      let message = '';
      let R: number | undefined;
      let startEPS: number | undefined;
      let endEPS: number | undefined;
      let grahamPrice: number | undefined;
      let priceDeviationPercent: number | undefined;
      let grahamPriceR3: number | undefined;
      let grahamPriceR5: number | undefined;
      let grahamPriceR7: number | undefined;

      const asOfDate = new Date().toISOString().split('T')[0];

      let baseRow: Partial<ValuationRow> = {
        stockCode: rawInput.stockCode,
        stockName: '',
        currentPrice: 0,
        startYear: rawInput.startYear,
        endYear: rawInput.endYear,
        dataAsOfDate: asOfDate,
      };

      try {
        if (!isValidAShareStockCode(rawInput.stockCode)) {
          throw new Error('股票代码不能为空或格式不正确');
        }
        const normalizedCode = normalizeStockCode(rawInput.stockCode);
        const input = { ...rawInput, stockCode: normalizedCode };
        baseRow.stockCode = normalizedCode;
        validateInput(input);

        const snapshot = await dataProvider.getStockSnapshot(input.stockCode);
        baseRow.stockName = snapshot.stockName;
        baseRow.currentPrice = snapshot.currentPrice;
        baseRow.dataAsOfDate = snapshot.priceAsOfDate;

        const epsHistory = await dataProvider.getAdjustedEpsHistory(input.stockCode, input.startYear, input.endYear);
        const latestRoe = await dataProvider.getLatestRoe(input.stockCode);
        baseRow.roeLatest = latestRoe.roe;

        const startEpsRecord = epsHistory.find(r => r.year === input.startYear);
        const endEpsRecord = epsHistory.find(r => r.year === input.endYear);

        if (!startEpsRecord) {
          throw new Error(`缺少 ${input.startYear} 年扣非 EPS 数据`);
        }
        if (!endEpsRecord) {
          throw new Error(`缺少 ${input.endYear} 年扣非 EPS 数据`);
        }

        startEPS = startEpsRecord.adjustedEps;
        endEPS = endEpsRecord.adjustedEps;

        if (startEPS <= 0 || endEPS <= 0) {
          throw new Error('EPS 非正，CAGR 无法可靠计算');
        }

        const n = input.endYear - input.startYear;
        R = computeCagrR(startEPS, endEPS, n);

        const E = endEPS;
        grahamPrice = computeGrahamPrice(E, R, input.Y);
        priceDeviationPercent = computePriceDeviation(snapshot.currentPrice, grahamPrice);

        grahamPriceR3 = computeGrahamPrice(E, 3, input.Y);
        grahamPriceR5 = computeGrahamPrice(E, 5, input.Y);
        grahamPriceR7 = computeGrahamPrice(E, 7, input.Y);

        if (R < 0 || R > 17) {
          status = 'WARNING';
          message = 'R 超出常规企业建议区间 0~17，请谨慎解读';
        }
      } catch (err: any) {
        status = 'ERROR';
        message = err.message || '未知错误';
      }

      rows.push({
        ...baseRow,
        startEPS,
        endEPS,
        R,
        grahamPrice,
        priceDeviationPercent,
        grahamPriceR3,
        grahamPriceR5,
        grahamPriceR7,
        status,
        message,
      } as ValuationRow);
    }

    res.json({ rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
