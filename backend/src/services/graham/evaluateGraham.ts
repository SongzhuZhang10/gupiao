import {
  GrahamValuationInput,
  ValuationRow,
  validateInput,
  computeCagrRFromRoundedEps,
  computeGrahamPrice,
  computePriceDeviation,
  roundEpsToTwoDecimals,
  DEFAULT_R_GROWTH_COEFF,
} from '../../utils/grahamValuation';
import {
  isValidStockCode,
  normalizeStockCode,
  parseMarketRegion,
  stockCodeErrorForMarket,
} from '../../utils/stock';
import { resolveEffectiveGrahamYears } from '../../utils/grahamYearRange';
import { GrahamStockDataProvider } from '../grahamDataProvider';
import { cacheTtlMsFromHours } from '../stockCache';
import { GrahamRefreshPolicy } from './cachingGrahamDataProvider';
import { createGrahamDataProvider } from './createGrahamDataProvider';

export type GrahamProviderFactory = (market: ReturnType<typeof parseMarketRegion>) => GrahamStockDataProvider;

export interface EvaluateGrahamOptions {
  refreshPolicy?: GrahamRefreshPolicy;
  cacheTtlHours?: number;
}

export function resolveProviderFactory(options?: EvaluateGrahamOptions): GrahamProviderFactory {
  const refreshPolicy = options?.refreshPolicy ?? 'default';
  const snapshotTtlMs = cacheTtlMsFromHours(options?.cacheTtlHours);
  return market =>
    createGrahamDataProvider(market, {
      refreshPolicy,
      snapshotTtlMs,
    });
}

export async function evaluateGrahamInputs(
  inputs: GrahamValuationInput[],
  providerFactory?: GrahamProviderFactory,
  options?: EvaluateGrahamOptions
): Promise<ValuationRow[]> {
  const factory = providerFactory ?? resolveProviderFactory(options);
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
    let grahamPriceR0: number | undefined;
    let roeLatest: number | undefined;
    let bvps: number | undefined;

    const asOfDate = new Date().toISOString().split('T')[0];
    const market = parseMarketRegion(rawInput.market);

    const baseRow: Partial<ValuationRow> = {
      stockCode: rawInput.stockCode,
      stockName: '',
      currentPrice: 0,
      startYear: rawInput.startYear,
      endYear: rawInput.endYear,
      dataAsOfDate: asOfDate,
    };

    try {
      if (!isValidStockCode(rawInput.stockCode, market)) {
        throw new Error(stockCodeErrorForMarket(market));
      }
      const normalizedCode = normalizeStockCode(rawInput.stockCode, market);
      const input = { ...rawInput, stockCode: normalizedCode, market };
      baseRow.stockCode = normalizedCode;
      validateInput(input);

      const dataProvider = factory(market);
      const snapshot = await dataProvider.getStockSnapshot(input.stockCode);
      baseRow.stockName = snapshot.stockName;
      baseRow.currentPrice = snapshot.currentPrice;
      baseRow.dataAsOfDate = snapshot.priceAsOfDate;
      baseRow.dataSource = snapshot.dataSource;

      const epsHistory = await dataProvider.getAdjustedEpsHistory(
        input.stockCode,
        input.startYear,
        input.endYear
      );

      const fullEpsForYears = epsHistory.filter(
        r => r.year >= input.startYear - 10 && r.year <= input.endYear + 1
      );
      const resolvedYears = resolveEffectiveGrahamYears(
        fullEpsForYears.length > 0 ? fullEpsForYears : epsHistory,
        input.startYear,
        input.endYear
      );
      if (resolvedYears.adjusted) {
        status = status === 'OK' ? 'WARNING' : status;
        const yearNote = resolvedYears.messages.join('；');
        message = message ? `${message}；${yearNote}` : yearNote;
      }
      const effectiveStartYear = resolvedYears.startYear;
      const effectiveEndYear = resolvedYears.endYear;

      try {
        const latestRoe = await dataProvider.getLatestRoe(input.stockCode);
        roeLatest = latestRoe.roe;
      } catch (roeError: unknown) {
        status = 'WARNING';
        message = roeError instanceof Error ? roeError.message : 'ROE 暂不可用';
      }

      try {
        const bvpsHistory = await dataProvider.getBvpsHistory(
          input.stockCode,
          input.startYear,
          input.endYear
        );
        const endBvpsRecord = bvpsHistory.find(record => record.year === effectiveEndYear);
        if (!endBvpsRecord) {
          throw new Error(`缺少 ${effectiveEndYear} 年 BVPS 数据`);
        }
        bvps = roundEpsToTwoDecimals(endBvpsRecord.bvps);
      } catch (bvpsError: unknown) {
        status = 'WARNING';
        const bvpsMessage = bvpsError instanceof Error ? bvpsError.message : 'BVPS 暂不可用';
        message = message ? `${message}；${bvpsMessage}` : bvpsMessage;
      }

      const startEpsRecord = epsHistory.find(r => r.year === effectiveStartYear);
      const endEpsRecord = epsHistory.find(r => r.year === effectiveEndYear);

      const availableYears = epsHistory.map(record => record.year).join(', ');
      if (!startEpsRecord) {
        throw new Error(
          `缺少 ${effectiveStartYear} 年扣非 EPS 数据${availableYears ? `（可用年份: ${availableYears}）` : ''}`
        );
      }
      if (!endEpsRecord) {
        throw new Error(
          `缺少 ${effectiveEndYear} 年扣非 EPS 数据${availableYears ? `（可用年份: ${availableYears}）` : ''}`
        );
      }

      startEPS = roundEpsToTwoDecimals(startEpsRecord.adjustedEps);
      endEPS = roundEpsToTwoDecimals(endEpsRecord.adjustedEps);

      if (startEPS <= 0 || endEPS <= 0) {
        throw new Error('EPS 非正，CAGR 无法可靠计算');
      }

      const n = effectiveEndYear - effectiveStartYear;
      R = computeCagrRFromRoundedEps(startEPS, endEPS, n);

      const E = endEPS;
      const rGrowthCoeff = input.rGrowthCoeff ?? DEFAULT_R_GROWTH_COEFF;
      grahamPrice = computeGrahamPrice(E, R, input.Y, rGrowthCoeff);
      priceDeviationPercent = computePriceDeviation(snapshot.currentPrice, grahamPrice);

      grahamPriceR0 = computeGrahamPrice(E, 0, input.Y, rGrowthCoeff);
      grahamPriceR3 = computeGrahamPrice(E, 3, input.Y, rGrowthCoeff);
      grahamPriceR5 = computeGrahamPrice(E, 5, input.Y, rGrowthCoeff);

      if (R < 0 || R > 17) {
        status = 'WARNING';
        message = message
          ? `${message}；R 超出常规企业建议区间 0~17，请谨慎解读`
          : 'R 超出常规企业建议区间 0~17，请谨慎解读';
      }
    } catch (err: unknown) {
      status = 'ERROR';
      message = err instanceof Error ? err.message : '未知错误';
    }

    rows.push({
      ...baseRow,
      startEPS,
      endEPS,
      R,
      grahamPrice,
      priceDeviationPercent,
      grahamPriceR0,
      grahamPriceR3,
      grahamPriceR5,
      roeLatest,
      bvps,
      status,
      message,
    } as ValuationRow);
  }

  return rows;
}
