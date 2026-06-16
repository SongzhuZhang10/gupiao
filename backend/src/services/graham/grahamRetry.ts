const TRANSIENT_PATTERN =
  /timeout|ECONNRESET|ENOTFOUND|ETIMEDOUT|socket hang up|Network Error|429|502|503|504/i;

export function isTransientGrahamError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_PATTERN.test(message);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const GRAHAM_PROVIDER_RETRY_DELAYS_MS = [400, 900] as const;
