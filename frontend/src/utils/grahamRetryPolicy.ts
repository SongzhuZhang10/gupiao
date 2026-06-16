const RETRYABLE_PATTERN =
  /timeout|ECONNRESET|ENOTFOUND|ETIMEDOUT|socket hang up|Network Error|429|502|503|504|All Graham providers failed|估值数据未加载|外部数据源不可用|已返回过期本地缓存/i;

export function isRetryableGrahamError(message: string): boolean {
  return RETRYABLE_PATTERN.test(message);
}

export function pickAutoRetryCodes(
  rows: Array<{ stockCode: string; status: 'OK' | 'ERROR' | 'WARNING'; message: string }>
): string[] {
  return rows
    .filter(row => row.status === 'ERROR' && isRetryableGrahamError(row.message))
    .map(row => row.stockCode);
}

export const AUTO_RETRY_DELAY_MS = 800;
