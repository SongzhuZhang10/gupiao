import { fetchHistoricalDataWithMeta } from '../../services/dataSources';
import { DebugReport } from '../format';
import { normalizeStockCode, parseMarketRegion } from '../../utils/stock';

interface StocksCommandOptions {
  market?: string;
  code?: string;
  start?: string;
  end?: string;
  allowMockFallback?: boolean;
}

export async function runStocksHistory(options: StocksCommandOptions): Promise<DebugReport> {
  const started = Date.now();
  const market = parseMarketRegion(options.market);
  const code = normalizeStockCode(String(options.code ?? ''), market);
  const startDate = String(options.start ?? '2024-01-01');
  const endDate = String(options.end ?? '2024-12-31');

  try {
    const result = await fetchHistoricalDataWithMeta(
      code,
      startDate,
      endDate,
      'forward',
      'dv_ttm',
      { market, allowMockFallback: Boolean(options.allowMockFallback) }
    );
    return {
      command: 'stocks.history',
      ok: true,
      durationMs: Date.now() - started,
      data: {
        code,
        market,
        startDate,
        endDate,
        dataSource: result.dataSource,
        barCount: result.data.length,
        warnings: result.warnings,
        attempts: result.attempts,
        sample: result.data.slice(0, 3),
      },
    };
  } catch (error: unknown) {
    return {
      command: 'stocks.history',
      ok: false,
      durationMs: Date.now() - started,
      error: {
        message: error instanceof Error ? error.message : String(error),
        details: error,
      },
    };
  }
}
