export interface GrahamValuationInput {
  stockCode: string;
  startYear: number;
  endYear: number;
  Y: number;
}

export interface ValuationRow {
  stockCode: string;
  stockName: string;
  currentPrice: number;
  startYear: number;
  endYear: number;
  startEPS?: number;
  endEPS?: number;
  R?: number;
  grahamPrice?: number;
  priceDeviationPercent?: number;
  grahamPriceR3?: number;
  grahamPriceR5?: number;
  grahamPriceR7?: number;
  roeLatest?: number;
  dataAsOfDate: string;
  status: 'OK' | 'ERROR' | 'WARNING';
  message: string;
}

export function validateInput(input: GrahamValuationInput) {
  if (!input.stockCode || input.stockCode.trim() === '') {
    throw new Error('股票代码不能为空或格式不正确');
  }
  if (!Number.isInteger(input.startYear) || !Number.isInteger(input.endYear)) {
    throw new Error('年份必须是整数');
  }
  if (input.startYear >= input.endYear) {
    throw new Error('开始年份必须早于结束年份');
  }
  if (typeof input.Y !== 'number' || isNaN(input.Y) || input.Y <= 0) {
    throw new Error('Y 必须大于 0，不能为 0 或负数');
  }
}

export function computeCagrR(startEPS: number, endEPS: number, n: number): number {
  if (startEPS <= 0 || endEPS <= 0) {
    throw new Error('EPS 非正，CAGR 无法可靠计算');
  }
  return (Math.pow(endEPS / startEPS, 1 / n) - 1) * 100;
}

export function computeGrahamPrice(E: number, R: number, Y: number): number {
  const growthMultiplier = 8.5 + 2 * R;
  const yieldAdjustment = 4.4 / Y;
  return E * growthMultiplier * yieldAdjustment;
}

export function computePriceDeviation(currentPrice: number, V: number): number {
  if (currentPrice <= 0) {
    throw new Error('当前股价非正，无法计算偏离率');
  }
  return ((currentPrice - V) / currentPrice) * 100;
}
