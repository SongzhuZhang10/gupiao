export type ZoneId = "strong_buy" | "add" | "hold" | "reduce" | "exit";

export interface Quantiles {
  q20: number;
  q40: number;
  q60: number;
  q80: number;
}

export function calculateQuantiles(values: number[]): Quantiles {
  if (values.length === 0) {
    return { q20: 0, q40: 0, q60: 0, q80: 0 };
  }
  if (values.length === 1) {
    const v = values[0];
    return { q20: v, q40: v, q60: v, q80: v };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  const getQ = (p: number) => {
    const index = (n - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };

  return {
    q20: getQ(0.2),
    q40: getQ(0.4),
    q60: getQ(0.6),
    q80: getQ(0.8),
  };
}

export function classifyZone(dividendYield: number, quantiles: Quantiles): ZoneId {
  if (dividendYield >= quantiles.q80) return "strong_buy";
  if (dividendYield >= quantiles.q60) return "add";
  if (dividendYield >= quantiles.q40) return "hold";
  if (dividendYield >= quantiles.q20) return "reduce";
  return "exit";
}
