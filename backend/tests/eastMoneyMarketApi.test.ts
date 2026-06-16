import { describe, expect, it } from 'vitest';
import {
  buildEastMoneyDelayQuoteUrl,
  buildEastMoneyKlineUrl,
  parseEastMoneyDelayQuotePrice,
} from '../src/services/graham/eastMoneyMarketApi';

describe('eastMoneyMarketApi', () => {
  it('builds kline and delay quote URLs', () => {
    expect(buildEastMoneyKlineUrl('push2his.eastmoney.com', '1.600519', { end: '20500101', lmt: 2 })).toContain(
      'push2his.eastmoney.com/api/qt/stock/kline/get'
    );
    expect(buildEastMoneyDelayQuoteUrl('1.600519')).toContain('push2delay.eastmoney.com/api/qt/stock/get');
  });

  it('parses push2delay f43 price field', () => {
    expect(parseEastMoneyDelayQuotePrice(125567)).toBe(1255.67);
    expect(parseEastMoneyDelayQuotePrice(0)).toBeUndefined();
    expect(parseEastMoneyDelayQuotePrice('bad')).toBeUndefined();
  });
});
