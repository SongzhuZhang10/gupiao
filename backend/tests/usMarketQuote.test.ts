import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { fetchUsMarketSnapshot } from '../src/services/graham/usMarketQuote';

vi.mock('axios');

describe('fetchUsMarketSnapshot', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.stubEnv('NODE_ENV', 'development');
  });

  it('falls back to Nasdaq when Yahoo returns 403', async () => {
    vi.mocked(axios.get).mockImplementation(async (url: string) => {
      if (url.includes('finance.yahoo.com')) {
        return { status: 403, data: '<html>Yahoo blocked</html>' } as any;
      }
      if (url.includes('api.nasdaq.com')) {
        return {
          status: 200,
          data: {
            data: {
              symbol: 'NVDA',
              companyName: 'NVIDIA Corporation Common Stock',
              primaryData: {
                lastSalePrice: '$211.50',
                lastTradeTimestamp: 'Jun 16, 2026 7:04 AM ET',
              },
              secondaryData: {
                lastSalePrice: '$212.45',
                lastTradeTimestamp: 'Closed at Jun 15, 2026 4:00 PM ET',
              },
            },
          },
        } as any;
      }
      throw new Error(`unexpected url ${url}`);
    });

    const snapshot = await fetchUsMarketSnapshot('NVDA');
    expect(snapshot.dataSource).toBe('nasdaq');
    expect(snapshot.currentPrice).toBe(212.45);
    expect(snapshot.priceAsOfDate).toBe('2026-06-15');
    expect(snapshot.qualityFlags).toContain('yahoo_blocked_nasdaq_fallback');
  });
});
