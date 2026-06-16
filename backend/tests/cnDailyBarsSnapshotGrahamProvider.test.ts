import { describe, expect, it } from 'vitest';
import { CnDailyBarsSnapshotGrahamProvider } from '../src/services/graham/cnDailyBarsSnapshotGrahamProvider';
import { DailyBarRecord, ProviderResult } from '../src/services/providers/types';

function dailyBar(close: number, tradeDate = '2026-06-10'): DailyBarRecord {
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

describe('CnDailyBarsSnapshotGrahamProvider', () => {
  it('maps the latest daily bar close into a Graham snapshot', async () => {
    const getDailyBars = async (): Promise<ProviderResult<DailyBarRecord>> => ({
      data: [dailyBar(1400, '2026-06-09'), dailyBar(1500, '2026-06-10')],
      sourceMetadata: dailyBar(1500).metadata,
      attempts: [],
      warnings: [],
    });

    const provider = new CnDailyBarsSnapshotGrahamProvider(
      getDailyBars,
      async () => '贵州茅台'
    );
    const snapshot = await provider.getStockSnapshot('600519.SH');

    expect(snapshot.currentPrice).toBe(1500);
    expect(snapshot.priceAsOfDate).toBe('2026-06-10');
    expect(snapshot.stockName).toBe('贵州茅台');
  });
});
