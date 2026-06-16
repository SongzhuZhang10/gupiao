/** EastMoney market-data hosts. push2his is primary; push2delay works when push2his is blocked. */
export const EASTMONEY_KLINE_HOSTS = ['push2his.eastmoney.com', 'push2delay.eastmoney.com'] as const;

export const EASTMONEY_QUOTE_HOST = 'push2delay.eastmoney.com';

export function buildEastMoneyKlineUrl(
  host: string,
  secid: string,
  options: { beg?: string; end?: string; lmt?: number }
): string {
  const params = new URLSearchParams({
    secid,
    klt: '101',
    fqt: '0',
    fields1: 'f1,f2,f3,f4,f5,f6',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
  });
  if (options.beg) params.set('beg', options.beg);
  if (options.end) params.set('end', options.end);
  if (options.lmt != null) params.set('lmt', String(options.lmt));
  return `https://${host}/api/qt/stock/kline/get?${params.toString()}`;
}

export function buildEastMoneyDelayQuoteUrl(secid: string): string {
  return `https://${EASTMONEY_QUOTE_HOST}/api/qt/stock/get?secid=${secid}&fields=f43,f57,f58`;
}

/** f43 from push2delay stock/get is price × 100 (e.g. 125567 → 1255.67). */
export function parseEastMoneyDelayQuotePrice(f43: unknown): number | undefined {
  const raw = Number(f43);
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  return raw / 100;
}
