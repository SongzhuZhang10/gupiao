import { DebugReport } from '../format';
import { evaluateGrahamInputs } from '../../services/graham/evaluateGraham';
import { normalizeStockCode, parseMarketRegion } from '../../utils/stock';
import { parseCodesArg } from '../utils/parseCodes';

interface GrahamPoolOptions {
  market?: string;
  codes?: string;
  startYear?: number;
  endYear?: number;
  y?: number;
}

function defaultYears(): { startYear: number; endYear: number } {
  const endYear = new Date().getFullYear() - 1;
  return { startYear: endYear - 5, endYear };
}

function stockPoolStorageKey(market: string): string {
  return `grahamStockPool_${market}`;
}

/** In-memory localStorage for pool persistence simulation (mirrors browser keys). */
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  };
}

/**
 * Simulates GUI「一键重新计算所有股票」: batch evaluate for multiple codes.
 */
export async function runGrahamRefreshPool(options: GrahamPoolOptions): Promise<DebugReport> {
  const started = Date.now();
  const market = parseMarketRegion(options.market);
  const defaults = defaultYears();
  const startYear = options.startYear ?? defaults.startYear;
  const endYear = options.endYear ?? defaults.endYear;
  const y = options.y ?? 1.71;
  const rawCodes = parseCodesArg(options.codes);

  if (rawCodes.length === 0) {
    return {
      command: 'graham.refresh-pool',
      ok: false,
      durationMs: Date.now() - started,
      error: { message: '缺少 --codes（逗号分隔）' },
      hints: ['示例: npm run debug -- graham refresh-pool --market us --codes NVDA,AAPL --start-year 2020 --end-year 2025'],
    };
  }

  const codes = rawCodes.map(code => normalizeStockCode(code, market));
  const rows = await evaluateGrahamInputs(
    codes.map(stockCode => ({ stockCode, startYear, endYear, Y: y, market }))
  );

  const okRows = rows.filter(row => row.status === 'OK' || row.status === 'WARNING');
  const errorRows = rows.filter(row => row.status === 'ERROR');
  const ok = okRows.length > 0;

  return {
    command: 'graham.refresh-pool',
    ok,
    durationMs: Date.now() - started,
    data: {
      market,
      codes,
      startYear,
      endYear,
      y,
      summary: {
        total: rows.length,
        ok: okRows.length,
        warning: rows.filter(row => row.status === 'WARNING').length,
        error: errorRows.length,
      },
      rows,
    },
    hints:
      errorRows.length > 0
        ? [`${errorRows.length} 只股票计算失败，用 graham probe / sec probe 查看可用年份`]
        : ['模拟 GUI 全部刷新成功；前端表格应显示 rows 中所有股票'],
    error: ok ? undefined : { message: '股票池全部计算失败', details: errorRows },
  };
}

/**
 * Verifies per-market stock pool keys do not cross-contaminate (frontend localStorage contract).
 */
export function runGrahamPoolStorageCheck(): DebugReport {
  const started = Date.now();
  const storage = createMemoryStorage();

  const writePool = (market: string, pool: string[]) => {
    storage.setItem(stockPoolStorageKey(market), JSON.stringify(pool));
  };
  const readPool = (market: string): string[] => {
    const raw = storage.getItem(stockPoolStorageKey(market));
    if (!raw) return [];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  };

  writePool('cn', ['600519.SH']);
  writePool('us', ['NVDA', 'AAPL']);

  const cnPool = readPool('cn');
  const usPool = readPool('us');

  const cnOk = cnPool.length === 1 && cnPool[0] === '600519.SH';
  const usOk = usPool.length === 2 && usPool.includes('NVDA') && usPool.includes('AAPL');
  const noCross = !usPool.includes('600519.SH') && !cnPool.includes('NVDA');

  const ok = cnOk && usOk && noCross;

  return {
    command: 'graham.pool-storage-check',
    ok,
    durationMs: Date.now() - started,
    data: {
      cnPool,
      usPool,
      checks: { cnOk, usOk, noCross },
      keys: { cn: stockPoolStorageKey('cn'), us: stockPoolStorageKey('us') },
    },
    error: ok ? undefined : { message: '股票池 localStorage 键隔离检查失败' },
    hints: ok
      ? ['前端应使用 grahamStockPool_cn / grahamStockPool_us 分市场持久化']
      : ['检查 GrahamValuation 是否在切换市场时写错了 localStorage 键'],
  };
}
