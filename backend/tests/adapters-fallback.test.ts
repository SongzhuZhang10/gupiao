import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProviders } from '../src/services/providers/adapters';
import * as pythonBridge from '../src/services/providers/pythonBridge';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('../src/services/providers/pythonBridge', () => ({
  runPythonProvider: vi.fn(),
}));

describe('adapter provider fallback', () => {
  beforeEach(() => {
    vi.stubEnv('ALLOW_LIVE_PROVIDER_TESTS', 'true');
  });

  afterEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(pythonBridge.runPythonProvider).mockReset();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('baostock daily bars falls back to sina when python bridge times out', async () => {
    vi.mocked(pythonBridge.runPythonProvider).mockRejectedValue(
      new Error('baostock python bridge timed out')
    );
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: [
        {
          day: '2024-01-02',
          open: '100',
          high: '105',
          low: '98',
          close: '102',
          volume: '1000',
          amount: '100000',
        },
      ],
    });

    const baostock = createProviders('cn').find(provider => provider.name === 'baostock');
    expect(baostock).toBeDefined();

    const bars = await baostock!.getDailyBars!('600519.SH', '2024-01-01', '2024-01-31');

    expect(bars[0].metadata.logical_source).toBe('baostock');
    expect(bars[0].metadata.quality_flags).toContain('bridge_fallback_sina');
    expect(bars[0].close).toBe(102);
  });

  it('eastmoney daily bars falls back to sina when all kline hosts return empty', async () => {
    vi.mocked(axios.get).mockImplementation(async (url: string) => {
      if (url.includes('push2his.eastmoney.com') || url.includes('push2delay.eastmoney.com')) {
        return { data: { data: { klines: [] } } };
      }
      if (url.includes('money.finance.sina.com.cn')) {
        return {
          data: [
            {
              day: '2024-01-02',
              open: '90',
              high: '100',
              low: '88',
              close: '99',
              volume: '5000',
              amount: '500000',
            },
          ],
        };
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const eastmoney = createProviders('cn').find(provider => provider.name === 'eastmoney');
    expect(eastmoney).toBeDefined();

    const bars = await eastmoney!.getDailyBars!('600519.SH', '2024-01-01', '2024-01-31');

    expect(bars[0].close).toBe(99);
    expect(bars[0].metadata.logical_source).toBe('eastmoney');
    expect(bars[0].metadata.quality_flags).toContain('kline_fallback_sina');
  });
});
