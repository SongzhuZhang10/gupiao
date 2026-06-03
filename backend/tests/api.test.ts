import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import stocksRouter from '../src/routes/stocks';

const app = express();
app.use(express.json());
app.use('/api/stocks', stocksRouter);

describe('API Route /api/stocks/:tsCode/history', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('should return 400 if startDate or endDate is missing', async () => {
    const res = await request(app).get('/api/stocks/600519/history?startDate=2024-01-01');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('should return a structured provider error when real sources fail and mock is disabled', async () => {
    const res = await request(app).get('/api/stocks/600519/history?startDate=2024-01-01&endDate=2024-01-31');

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('所有免费数据源均不可用');
    expect(res.body.details).toMatchObject({
      name: 'ProviderFallbackError',
      dataType: 'daily_bars',
      symbol: '600519.SH',
    });
    expect(res.body.details.attempts.length).toBeGreaterThan(0);
  });

  it('should keep mock fallback behind explicit configuration', async () => {
    vi.stubEnv('ENABLE_MOCK_DATA_FALLBACK', 'true');
    const res = await request(app).get('/api/stocks/600519/history?startDate=2024-01-01&endDate=2024-01-31');

    expect(res.status).toBe(200);
    expect(res.body.stockCode).toBe('600519.SH');
    expect(res.body.dataSource).toBe('mock');
    expect(res.body.sourceMetadata).toMatchObject({
      logical_source: 'mock',
      fallback_used: true,
    });
  });

  it('should return mock dividend yield zones only when mock fallback is explicitly enabled', async () => {
    vi.stubEnv('ENABLE_MOCK_DATA_FALLBACK', 'true');
    const res = await request(app).get('/api/stocks/600519/dividend-yield-zones?startDate=2010-01-01&endDate=2026-06-03&lookbackYears=10');

    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe('mock');
    expect(res.body.sourceMetadata.logical_source).toBe('mock');
    expect(res.body.warnings).toContain('真实数据源不可用，当前操作区间基于 Mock 数据降级展示。');
    expect(res.body.samples.length).toBeGreaterThanOrEqual(100);
    expect(res.body.quantiles.q20).toBeGreaterThan(0);
    expect(res.body.zones).toHaveLength(5);
  });
});
