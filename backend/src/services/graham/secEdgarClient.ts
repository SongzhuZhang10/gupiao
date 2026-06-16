import axios from 'axios';
import { grahamProviderTimeoutMs } from './providerTimeout';

const SEC_DATA_BASE = 'https://data.sec.gov';
const SEC_WWW_BASE = 'https://www.sec.gov';
/** SEC requires a descriptive User-Agent with contact info (see sec.gov/os/webmaster-faq). */
const SEC_USER_AGENT =
  process.env.SEC_EDGAR_USER_AGENT ?? 'gupiao graham-valuation admin@gupiao.local';

let tickerCikMap: Map<string, number> | null = null;

function isLiveDisabledInTest(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.ALLOW_LIVE_PROVIDER_TESTS !== 'true';
}

function secHeaders() {
  return { 'User-Agent': SEC_USER_AGENT, Accept: 'application/json' };
}

function padCik(cik: number): string {
  return String(cik).padStart(10, '0');
}

async function loadTickerCikMap(): Promise<Map<string, number>> {
  if (tickerCikMap) return tickerCikMap;
  const res = await axios.get(`${SEC_WWW_BASE}/files/company_tickers.json`, {
    timeout: grahamProviderTimeoutMs('us'),
    headers: secHeaders(),
  });
  const entries = Object.values(res.data ?? {}) as Array<{ ticker: string; cik_str: number }>;
  tickerCikMap = new Map(
    entries.map(entry => [entry.ticker.toUpperCase(), entry.cik_str])
  );
  return tickerCikMap;
}

export async function resolveSecCik(ticker: string): Promise<number> {
  if (isLiveDisabledInTest()) {
    throw new Error('sec edgar provider disabled in test environment');
  }
  const map = await loadTickerCikMap();
  const cik = map.get(ticker.toUpperCase());
  if (!cik) throw new Error(`SEC 未找到股票代码 ${ticker}`);
  return cik;
}

export async function fetchSecCompanyFacts(ticker: string): Promise<Record<string, unknown>> {
  const cik = await resolveSecCik(ticker);
  const res = await axios.get(`${SEC_DATA_BASE}/api/xbrl/companyfacts/CIK${padCik(cik)}.json`, {
    timeout: grahamProviderTimeoutMs('us'),
    headers: secHeaders(),
  });
  if (!res.data || typeof res.data !== 'object') {
    throw new Error('SEC 公司财务数据不可用');
  }
  return res.data as Record<string, unknown>;
}

/** Test helper */
export function resetSecEdgarCachesForTest(): void {
  tickerCikMap = null;
}
