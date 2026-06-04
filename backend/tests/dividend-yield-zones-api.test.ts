import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express, { Router } from 'express';

function createApp(router: Router) {
  const app = express();
  app.use(express.json());
  app.use('/api/stocks', router);
  return app;
}

function metadata(logicalSource: 'baostock' | 'cninfo' | 'mock' = 'baostock') {
  return {
    logical_source: logicalSource,
    access_layer: 'fixture',
    retrieved_at: '2026-06-03T00:00:00.000Z',
    symbol: '600519.SH',
    market: 'SH',
    source_priority_rank: 1,
    fallback_used: false,
    raw_field_map: {},
    quality_flags: [],
  };
}

function dailyBars(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date('2020-01-01T00:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + index);
    const tradeDate = date.toISOString().split('T')[0];
    const close = 10 + (index % 20);
    return {
      trade_date: tradeDate,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1,
      metadata: metadata(),
    };
  });
}

async function loadRouterWithMockedDataSources(dividendFailure = false) {
  vi.resetModules();
  vi.doMock('../src/services/dataSources', async () => {
    const { ProviderFallbackError } = await import('../src/services/providers/types');
    return {
    fetchHistoricalDataWithMeta: vi.fn(async () => ({
      data: dailyBars(1500),
      dataSource: 'baostock',
      warnings: [],
      sourceMetadata: metadata(),
    })),
    fetchDividendEventsWithMeta: vi.fn(async () => {
      if (dividendFailure) {
        throw new ProviderFallbackError('dividend_events', '600519.SH', [
          {
            provider: 'cninfo',
            accessLayer: 'fixture',
            priorityRank: 1,
            status: 'failed',
            reason: 'fixture unavailable',
          },
        ]);
      }
      return {
        data: [
          {
            symbol: '600519.SH',
            ex_date: '2020-06-01',
            cash_dividend: 1,
            metadata: metadata('cninfo'),
          },
          {
            symbol: '600519.SH',
            ex_date: '2021-06-01',
            cash_dividend: 1.2,
            metadata: metadata('cninfo'),
          },
        ],
        dataSource: 'cninfo',
        warnings: [],
        sourceMetadata: metadata('cninfo'),
      };
    }),
  };
  });

  const mod = await import('../src/routes/stocks');
  return mod.default;
}

describe('API Route /api/stocks/:tsCode/dividend-yield-zones', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('../src/services/dataSources');
  });

  it('validates lookbackYears range and dividend basis', async () => {
    const router = await loadRouterWithMockedDataSources();
    const app = createApp(router);
    const invalidYears = await request(app).get(
      '/api/stocks/600519/dividend-yield-zones?startDate=2024-01-01&endDate=2024-12-31&lookbackYears=4'
    );
    const invalidBasis = await request(app).get(
      '/api/stocks/600519/dividend-yield-zones?startDate=2024-01-01&endDate=2024-12-31&dividendBasis=after_tax'
    );

    expect(invalidYears.status).toBe(400);
    expect(invalidYears.body.error).toBe('lookbackYears 必须是 5 到 10 之间的整数');
    expect(invalidBasis.status).toBe(400);
    expect(invalidBasis.body.error).toBe('当前仅支持税前现金分红口径');
  });

  it('returns a structured provider error instead of deriving zones when dividend events are unavailable', async () => {
    const router = await loadRouterWithMockedDataSources(true);
    const app = createApp(router);

    const res = await request(app).get(
      '/api/stocks/600519/dividend-yield-zones?startDate=2024-01-01&endDate=2024-12-31&lookbackYears=5'
    );

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('无法获取分红数据，暂不能计算股息率操作区间');
    expect(res.body.details).toMatchObject({
      name: 'ProviderFallbackError',
      dataType: 'dividend_events',
      symbol: '600519.SH',
    });
  });

  it('returns mock zones when mock fallback is explicitly enabled', async () => {
    vi.doUnmock('../src/services/dataSources');
    vi.resetModules();
    vi.stubEnv('ENABLE_MOCK_DATA_FALLBACK', 'true');
    const mod = await import('../src/routes/stocks');
    const app = createApp(mod.default);

    const res = await request(app).get(
      '/api/stocks/600519/dividend-yield-zones?startDate=2024-01-01&endDate=2026-06-03&lookbackYears=5'
    );

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('600519.SH');
    expect(res.body.dividendBasis).toBe('pre_tax');
    expect(res.body.lookbackYears).toBe(5);
    expect(res.body.thresholdWindowStart).toBe('2021-06-03');
    expect(res.body.thresholdWindowEnd).toBe('2026-06-03');
    expect(res.body.quantiles.q20).toBeGreaterThanOrEqual(0);
    expect(res.body.zones).toHaveLength(5);
    expect(res.body.samples.length).toBeGreaterThanOrEqual(100);
    expect(res.body.samples[0]).toEqual(
      expect.objectContaining({
        date: expect.any(String),
        close: expect.any(Number),
        ttmDividendPerShare: expect.any(Number),
        dividendYield: expect.any(Number),
        zoneId: expect.any(String),
      })
    );
  });
});
