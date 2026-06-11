import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import grahamRouter, {
  resetGrahamDataProviderFactoryForTests,
  setGrahamDataProviderFactoryForTests,
} from '../src/routes/graham';
import { MockGrahamDataProvider } from '../src/services/grahamDataProvider';

const app = express();
app.use(express.json());
app.use('/api/graham', grahamRouter);

describe('POST /api/graham/evaluate', () => {
  afterEach(() => {
    resetGrahamDataProviderFactoryForTests();
  });

  it('rejects malformed US codes when market=us', async () => {
    const res = await request(app).post('/api/graham/evaluate').send({
      inputs: [{ stockCode: '600519', startYear: 2019, endYear: 2024, Y: 2, market: 'us' }],
    });

    expect(res.status).toBe(200);
    expect(res.body.rows[0].status).toBe('ERROR');
    expect(res.body.rows[0].message).toContain('美股');
  });

  it('evaluates US stocks through injected provider factory', async () => {
    setGrahamDataProviderFactoryForTests(() => new MockGrahamDataProvider());
    const res = await request(app).post('/api/graham/evaluate').send({
      inputs: [{ stockCode: 'AAPL', startYear: 2020, endYear: 2022, Y: 2, market: 'us' }],
    });

    expect(res.status).toBe(200);
    expect(res.body.rows[0].status).toBe('OK');
    expect(res.body.rows[0].stockCode).toBe('AAPL');
    expect(res.body.rows[0].grahamPrice).toBeGreaterThan(0);
  });

  it('accepts refreshPolicy fresh-prices', async () => {
    setGrahamDataProviderFactoryForTests(() => new MockGrahamDataProvider());
    const res = await request(app).post('/api/graham/evaluate').send({
      inputs: [{ stockCode: 'AAPL', startYear: 2020, endYear: 2022, Y: 2, market: 'us' }],
      refreshPolicy: 'fresh-prices',
    });

    expect(res.status).toBe(200);
    expect(res.body.rows[0].status).toBe('OK');
  });

  it('rejects invalid refreshPolicy', async () => {
    const res = await request(app).post('/api/graham/evaluate').send({
      inputs: [{ stockCode: 'AAPL', startYear: 2020, endYear: 2022, Y: 2, market: 'us' }],
      refreshPolicy: 'always-fresh',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('refreshPolicy');
  });
});
