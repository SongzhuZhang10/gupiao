const unhealthyUntil = new Map<string, number>();

const DEFAULT_TTL_MS = 10 * 60 * 1000;

function healthKey(provider: string, dataType: string): string {
  return `${dataType}:${provider}`;
}

export function markProviderUnhealthy(
  provider: string,
  dataType: string,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  unhealthyUntil.set(healthKey(provider, dataType), Date.now() + ttlMs);
}

export function isProviderHealthy(provider: string, dataType: string): boolean {
  const key = healthKey(provider, dataType);
  const until = unhealthyUntil.get(key);
  if (!until) return true;
  if (Date.now() > until) {
    unhealthyUntil.delete(key);
    return true;
  }
  return false;
}

export function shouldMarkUnhealthy(reason?: string): boolean {
  if (!reason) return false;
  const lower = reason.toLowerCase();
  return (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('enotfound') ||
    lower.includes('socket hang up') ||
    lower.includes('未配置')
  );
}

export function resetProviderHealthForTest(): void {
  unhealthyUntil.clear();
}
