import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const STALE_CACHE_WARNING = '外部数据源不可用，已返回过期本地缓存。';

type CacheParamValue = string | number | boolean | null | undefined;

export interface StockCacheableResult {
  dataSource: string;
  warnings: string[];
  sourceMetadata?: {
    logical_source?: string;
  };
}

export interface StockCacheOptions<T extends StockCacheableResult> {
  dataType: string;
  params: Record<string, CacheParamValue>;
  ttlMs?: number;
  fetchFresh: () => Promise<T>;
}

interface CachePayload<T> {
  cachedAt: string;
  value: T;
}

interface CacheReadResult<T> {
  value: T;
  fresh: boolean;
}

const cacheDir = path.resolve(__dirname, '../../cache');

export function cacheTtlMsFromHours(value: unknown): number {
  if (value === undefined || value === null || value === '') return DEFAULT_CACHE_TTL_MS;
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_CACHE_TTL_MS;
  return Math.floor(hours * 60 * 60 * 1000);
}

function stableParams(params: Record<string, CacheParamValue>): Record<string, CacheParamValue> {
  return Object.keys(params)
    .sort()
    .reduce<Record<string, CacheParamValue>>((acc, key) => {
      const value = params[key];
      if (value !== undefined) acc[key] = value;
      return acc;
    }, {});
}

function cachePathFor(dataType: string, params: Record<string, CacheParamValue>): string {
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ dataType, params: stableParams(params) }))
    .digest('hex');
  return path.join(cacheDir, `${dataType}-${hash}.json`);
}

async function readCache<T>(filePath: string, ttlMs: number): Promise<CacheReadResult<T> | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const payload = JSON.parse(raw) as CachePayload<T>;
    if (!payload.cachedAt || payload.value === undefined) return null;
    const ageMs = Date.now() - new Date(payload.cachedAt).getTime();
    if (!Number.isFinite(ageMs)) return null;
    return {
      value: payload.value,
      fresh: ageMs <= ttlMs,
    };
  } catch {
    return null;
  }
}

function shouldWriteCache(result: StockCacheableResult): boolean {
  return result.dataSource !== 'mock' && result.sourceMetadata?.logical_source !== 'mock';
}

async function writeCache<T extends StockCacheableResult>(filePath: string, value: T): Promise<void> {
  if (!shouldWriteCache(value)) return;
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    const payload: CachePayload<T> = {
      cachedAt: new Date().toISOString(),
      value,
    };
    await fs.writeFile(filePath, JSON.stringify(payload), 'utf8');
  } catch (error) {
    console.warn('[StockCache] Failed to write cache', error);
  }
}

export async function withStockCache<T extends StockCacheableResult>({
  dataType,
  params,
  ttlMs = DEFAULT_CACHE_TTL_MS,
  fetchFresh,
}: StockCacheOptions<T>): Promise<T> {
  const filePath = cachePathFor(dataType, params);
  const cached = await readCache<T>(filePath, ttlMs);
  if (cached?.fresh) return cached.value;

  try {
    const fresh = await fetchFresh();
    await writeCache(filePath, fresh);
    return fresh;
  } catch (error) {
    if (cached) {
      return {
        ...cached.value,
        warnings: Array.from(new Set([...(cached.value.warnings || []), STALE_CACHE_WARNING])),
      };
    }
    throw error;
  }
}

export async function clearStockDataCache(): Promise<void> {
  await fs.rm(cacheDir, { recursive: true, force: true });
  await fs.mkdir(cacheDir, { recursive: true });
}
