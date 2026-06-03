import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import stocksRouter from '../src/routes/stocks';

const app = express();
app.use(express.json());
app.use('/api/stocks', stocksRouter);

describe('API Route /api/stocks/:tsCode/history', () => {
  it('should return 400 if startDate or endDate is missing', async () => {
    const res = await request(app).get('/api/stocks/600519/history?startDate=2024-01-01');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('should return valid mock data if no TUSHARE_TOKEN is provided', async () => {
    const res = await request(app).get('/api/stocks/600519/history?startDate=2024-01-01&endDate=2024-01-31');
    expect(res.status).toBe(200);
    expect(res.body.stockCode).toBe('600519.SH');
    expect(Array.isArray(res.body.points)).toBe(true);
    if (res.body.points.length > 0) {
      expect(res.body.points[0].sampleDate).toBeDefined();
      expect(res.body.points[0].price).toBeDefined();
    }
  });
});
