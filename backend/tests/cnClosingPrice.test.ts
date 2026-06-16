import { describe, expect, it } from 'vitest';
import { fetchLatestCloseFromDailyBars } from '../src/services/graham/cnClosingPrice';
import { DailyBarRecord, ProviderResult } from '../src/services/providers/types';

function dailyBar(close: number, tradeDate: string): DailyBarRecord {
  return {
    trade_date: tradeDate,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
    metadata: {
      logical_source: 'baostock',
      access_layer: 'python_bridge_baostock',
      retrieved_at: '2026-06-10T15:00:00.000Z',
      symbol: '600519.SH',
      market: 'SH',
      source_priority_rank: 1,
      fallback_used: false,
      raw_field_map: {},
      quality_flags: [],
    },
  };
}

describe('fetchLatestCloseFromDailyBars', () => {
  it('picks the latest trade date close from daily bars', async () => {
    const getDailyBars = async (): Promise<ProviderResult<DailyBarRecord>> => ({
      data: [dailyBar(1400, '2026-06-09'), dailyBar(1490, '2026-06-10')],
      sourceMetadata: dailyBar(1490, '2026-06-10').metadata,
      attempts: [],
      warnings: [],
    });

    const result = await fetchLatestCloseFromDailyBars('600519.SH', getDailyBars);
    expect(result.close).toBe(1490);
    expect(result.tradeDate).toBe('2026-06-10');
    expect(result.logicalSource).toBe('baostock');
  });

  it('throws when no valid close exists', async () => {
    const getDailyBars = async (): Promise<ProviderResult<DailyBarRecord>> => ({
      data: [],
      sourceMetadata: dailyBar(0, '2026-06-10').metadata,
      attempts: [],
      warnings: [],
    });

    await expect(fetchLatestCloseFromDailyBars('600519.SH', getDailyBars)).rejects.toThrow(
      '日线行情数据不可用'
    );
  });
});
