import { describe, expect, it } from 'vitest';
import {
  parseNasdaqClosedTradeDate,
  parseNasdaqPrice,
  pickNasdaqClosingQuote,
} from '../src/services/graham/nasdaqMarketApi';

describe('nasdaqMarketApi parsers', () => {
  it('parseNasdaqPrice strips currency formatting', () => {
    expect(parseNasdaqPrice('$212.45')).toBe(212.45);
    expect(parseNasdaqPrice('NA')).toBeUndefined();
  });

  it('parseNasdaqClosedTradeDate reads closed session timestamps', () => {
    expect(parseNasdaqClosedTradeDate('Closed at Jun 15, 2026 4:00 PM ET')).toBe('2026-06-15');
    expect(parseNasdaqClosedTradeDate('Jun 16, 2026 7:04 AM ET')).toBeUndefined();
  });

  it('pickNasdaqClosingQuote prefers official close over pre-market', () => {
    const picked = pickNasdaqClosingQuote({
      symbol: 'NVDA',
      companyName: 'NVIDIA Corporation Common Stock',
      primaryData: {
        lastSalePrice: '$211.50',
        lastTradeTimestamp: 'Jun 16, 2026 7:04 AM ET',
        isRealTime: true,
      },
      secondaryData: {
        lastSalePrice: '$212.45',
        lastTradeTimestamp: 'Closed at Jun 15, 2026 4:00 PM ET',
        isRealTime: false,
      },
    });

    expect(picked).toEqual({
      stockName: 'NVIDIA Corporation Common Stock',
      currentPrice: 212.45,
      priceAsOfDate: '2026-06-15',
    });
  });
});
