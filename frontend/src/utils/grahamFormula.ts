export const GRAHAM_BASE_MULTIPLIER = 5;
export const GRAHAM_YIELD_NUMERATOR = 3.6;
export const DEFAULT_R_GROWTH_COEFF = 2;

export function computeGrahamPrice(
  E: number,
  R: number,
  Y: number,
  rGrowthCoeff: number = DEFAULT_R_GROWTH_COEFF
): number {
  const growthMultiplier = GRAHAM_BASE_MULTIPLIER + rGrowthCoeff * R;
  return E * growthMultiplier * (GRAHAM_YIELD_NUMERATOR / Y);
}

export function computePriceDeviation(currentPrice: number, V: number): number {
  if (currentPrice <= 0) return NaN;
  return ((currentPrice - V) / currentPrice) * 100;
}

export interface RecalcableRow {
  endEPS?: number;
  R?: number;
  currentPrice: number;
  grahamPrice?: number;
  grahamPriceR0?: number;
  grahamPriceR3?: number;
  grahamPriceR5?: number;
  priceDeviationPercent?: number;
}

export function recalcValuationPrices<T extends RecalcableRow>(
  row: T,
  params: { Y: number; rGrowthCoeff: number }
): T {
  if (row.endEPS == null) return row;
  const E = row.endEPS;
  const { Y, rGrowthCoeff } = params;
  const grahamPrice =
    row.R != null ? computeGrahamPrice(E, row.R, Y, rGrowthCoeff) : undefined;
  const grahamPriceR0 = computeGrahamPrice(E, 0, Y, rGrowthCoeff);
  const grahamPriceR3 = computeGrahamPrice(E, 3, Y, rGrowthCoeff);
  const grahamPriceR5 = computeGrahamPrice(E, 5, Y, rGrowthCoeff);
  const priceDeviationPercent =
    grahamPrice != null ? computePriceDeviation(row.currentPrice, grahamPrice) : undefined;
  return {
    ...row,
    grahamPrice,
    grahamPriceR0,
    grahamPriceR3,
    grahamPriceR5,
    priceDeviationPercent,
  };
}
