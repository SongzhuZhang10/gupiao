import { DailyData } from '../utils/sampling';

function generateMockData(basePrice: number, baseDividend: number, days: number, endDate: Date): DailyData[] {
  const data: DailyData[] = [];
  let currentPrice = basePrice;
  let currentDiv = baseDividend;
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(endDate);
    date.setDate(date.getDate() - i);
    
    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    // Random walk for price
    currentPrice = currentPrice * (1 + (Math.random() - 0.5) * 0.02);
    // Dividend yield changes slowly
    currentDiv = currentDiv * (1 + (Math.random() - 0.5) * 0.005);
    
    const dateStr = date.toISOString().split('T')[0];
    
    data.push({
      trade_date: dateStr,
      close: Number(currentPrice.toFixed(2)),
      dividend_yield: Number(currentDiv.toFixed(2)),
      adj_factor: 1.0 // keep it simple for mock
    });
  }
  return data;
}

const today = new Date();
export const mockData600519 = generateMockData(1500, 2.5, 365 * 5, today);
export const mockData000001 = generateMockData(10, 5.0, 365 * 5, today);

export function getMockData(tsCode: string): DailyData[] {
  if (tsCode === '600519.SH') {
    return mockData600519;
  }
  if (tsCode === '000001.SZ') {
    return mockData000001;
  }
  // Return empty array for others or fallback to 000001
  return generateMockData(100, 3.0, 365 * 5, today);
}
