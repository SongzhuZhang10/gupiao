import axios from 'axios';
import { DailyData } from '../utils/sampling';

const TUSHARE_API_URL = 'http://api.tushare.pro';

// Helper: Fetch EastMoney Dividends
async function fetchEastMoneyDividends(tsCode: string): Promise<{ date: string, amount: number }[]> {
  try {
    const pureCode = tsCode.replace(/\.(SH|SZ)$/, '');
    const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_SHAREBONUS_DET&columns=ALL&quoteColumns=&filter=(SECURITY_CODE%3D%22${pureCode}%22)&pageNumber=1&pageSize=500&sortTypes=-1&sortColumns=EX_DIVIDEND_DATE&source=WEB&client=WEB`;
    const res = await axios.get(url, { timeout: 3000 });
    const data = res.data?.result?.data;
    if (!Array.isArray(data)) return [];
    
    const events: { date: string, amount: number }[] = [];
    for (const item of data) {
      if (item.PRETAX_BONUS_RMB && item.EX_DIVIDEND_DATE) {
        events.push({
          date: item.EX_DIVIDEND_DATE.split(' ')[0], 
          amount: item.PRETAX_BONUS_RMB / 10 
        });
      }
    }
    return events;
  } catch (error) {
    console.error('Failed to fetch EastMoney dividends:', error);
    return [];
  }
}

// Calculate Dividend
function calculateDividend(tradeDateStr: string, mode: string, closePrice: number, events: { date: string, amount: number }[]): number | null {
  if (events.length === 0) return null;
  const tradeDate = new Date(tradeDateStr);
  let sum = 0;
  
  if (mode === 'dv_ttm') {
    const oneYearAgo = new Date(tradeDate);
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);
    for (const event of events) {
      const evDate = new Date(event.date);
      if (evDate <= tradeDate && evDate > oneYearAgo) {
        sum += event.amount;
      }
    }
  } else {
    const tradeYear = tradeDate.getFullYear();
    const targetYear = tradeYear - 1;
    for (const event of events) {
      const evDate = new Date(event.date);
      if (evDate.getFullYear() === targetYear && evDate <= tradeDate) {
        sum += event.amount;
      }
    }
  }
  
  if (sum > 0 && closePrice > 0) {
    return Number(((sum / closePrice) * 100).toFixed(2));
  }
  return null;
}

// 1. Tushare
async function fetchTushareRaw(tsCode: string, startDate: string, endDate: string, priceMode: string, dividendMode: string): Promise<DailyData[] | null> {
  const token = process.env.TUSHARE_TOKEN;
  if (!token) throw new Error("Tushare token not found");

  const tradeDateStart = startDate.replace(/-/g, '');
  const tradeDateEnd = endDate.replace(/-/g, '');

  const dailyReq = axios.post(TUSHARE_API_URL, { api_name: 'daily', token, params: { ts_code: tsCode, start_date: tradeDateStart, end_date: tradeDateEnd }, fields: 'trade_date,close' });
  const dailyBasicReq = axios.post(TUSHARE_API_URL, { api_name: 'daily_basic', token, params: { ts_code: tsCode, start_date: tradeDateStart, end_date: tradeDateEnd }, fields: `trade_date,${dividendMode}` });
  const adjFactorReq = axios.post(TUSHARE_API_URL, { api_name: 'adj_factor', token, params: { ts_code: tsCode, start_date: tradeDateStart, end_date: tradeDateEnd }, fields: 'trade_date,adj_factor' });

  const [dailyRes, dailyBasicRes, adjRes] = await Promise.all([dailyReq, dailyBasicReq, adjFactorReq]);

  if (dailyRes.data.code !== 0 || dailyBasicRes.data.code !== 0 || adjRes.data.code !== 0) {
    throw new Error(`Tushare API error: ${dailyRes.data.msg}`);
  }

  const map = new Map<string, DailyData>();
  const parseDate = (d: string) => `${d.substring(0,4)}-${d.substring(4,6)}-${d.substring(6,8)}`;

  for (const item of (dailyRes.data.data.items || [])) {
    const date = parseDate(item[0]);
    map.set(date, { trade_date: date, close: item[1] });
  }

  for (const item of (dailyBasicRes.data.data.items || [])) {
    const date = parseDate(item[0]);
    if (map.has(date)) map.get(date)!.dividend_yield = item[1];
  }

  for (const item of (adjRes.data.data.items || [])) {
    const date = parseDate(item[0]);
    if (map.has(date)) map.get(date)!.adj_factor = item[1];
  }

  const mergedData = Array.from(map.values());
  if (priceMode !== 'unadjusted' && mergedData.length > 0) {
    mergedData.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    const latestAdj = mergedData[mergedData.length - 1].adj_factor || 1;
    const firstAdj = mergedData[0].adj_factor || 1;

    for (const d of mergedData) {
      if (d.close && d.adj_factor) {
        if (priceMode === 'forward') {
          d.close = Number((d.close * (d.adj_factor / latestAdj)).toFixed(2));
        } else if (priceMode === 'backward') {
          d.close = Number((d.close * (d.adj_factor / firstAdj)).toFixed(2));
        }
      }
    }
  }

  return mergedData;
}

// 2. EastMoney
async function fetchEastmoneyKlines(tsCode: string, startDate: string, endDate: string, dividendMode: string): Promise<DailyData[] | null> {
  const pureCode = tsCode.replace(/\.(SH|SZ)$/, '');
  const secid = tsCode.endsWith('.SH') ? `1.${pureCode}` : `0.${pureCode}`;
  const beg = startDate.replace(/-/g, '');
  const end = endDate.replace(/-/g, '');
  
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&klt=101&fqt=0&beg=${beg}&end=${end}&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55,f56,f57`;
  const res = await axios.get(url, { timeout: 3000 });
  
  const klines = res.data?.data?.klines;
  if (!klines || !Array.isArray(klines)) throw new Error("EastMoney missing klines data");

  const eastMoneyEvents = await fetchEastMoneyDividends(tsCode);
  const data: DailyData[] = [];
  
  for (const item of klines) {
    const parts = item.split(',');
    const tradeDateStr = parts[0];
    const closePrice = parseFloat(parts[2]);
    const dividendYield = calculateDividend(tradeDateStr, dividendMode, closePrice, eastMoneyEvents);
    data.push({ trade_date: tradeDateStr, close: closePrice, adj_factor: 1, dividend_yield: dividendYield ?? undefined });
  }
  
  return data;
}

// 3. Sohu
async function fetchSohuRaw(tsCode: string, startDate: string, endDate: string, dividendMode: string): Promise<DailyData[] | null> {
  let sohuCode = '';
  if (tsCode.endsWith('.SH')) sohuCode = 'cn_' + tsCode.replace('.SH', '');
  else if (tsCode.endsWith('.SZ')) sohuCode = 'cn_' + tsCode.replace('.SZ', '');
  else sohuCode = 'cn_' + tsCode; 
  
  const start = startDate.replace(/-/g, '');
  const end = endDate.replace(/-/g, '');
  const url = `https://q.stock.sohu.com/hisHq?code=${sohuCode}&start=${start}&end=${end}&stat=1&order=D&period=d&rt=json`;
  
  const res = await axios.get(url, { timeout: 3000 });
  if (res.data && res.data[0] && res.data[0].status === 0 && res.data[0].hq) {
    const hq = res.data[0].hq;
    const eastMoneyEvents = await fetchEastMoneyDividends(tsCode);
    const data: DailyData[] = hq.map((item: any[]) => {
      const tradeDateStr = item[0];
      const closePrice = parseFloat(item[2]);
      const dividendYield = calculateDividend(tradeDateStr, dividendMode, closePrice, eastMoneyEvents);
      return { trade_date: tradeDateStr, close: closePrice, adj_factor: 1, dividend_yield: dividendYield ?? undefined };
    });
    data.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    return data;
  }
  throw new Error("Sohu API failed");
}

// 4. Sina
async function fetchSinaRaw(tsCode: string, startDate: string, endDate: string, dividendMode: string): Promise<DailyData[] | null> {
  const symbol = tsCode.replace('.', '').toLowerCase();
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=5000`;
  const res = await axios.get(url, { timeout: 3000 });
  if (!Array.isArray(res.data)) throw new Error("Sina API failed");
  
  const eastMoneyEvents = await fetchEastMoneyDividends(tsCode);
  const data: DailyData[] = res.data
    .filter((d: any) => d.day >= startDate && d.day <= endDate)
    .map((d: any) => {
      const tradeDateStr = d.day;
      const closePrice = parseFloat(d.close);
      const dividendYield = calculateDividend(tradeDateStr, dividendMode, closePrice, eastMoneyEvents);
      return { trade_date: tradeDateStr, close: closePrice, adj_factor: 1, dividend_yield: dividendYield ?? undefined };
    });
    
  return data;
}

// 5. Cninfo (巨潮)
async function fetchCninfoRaw(tsCode: string, startDate: string, endDate: string, dividendMode: string): Promise<DailyData[] | null> {
  // Cninfo API is complex, implementing a placeholder that throws error to continue fallback or returns empty
  throw new Error("Cninfo API not implemented");
}

export async function fetchHistoricalData(
  tsCode: string,
  startDate: string,
  endDate: string,
  priceMode: string,
  dividendMode: string
): Promise<DailyData[]> {
  
  console.log(`[Data Fetch] Attempting to fetch data for ${tsCode} from ${startDate} to ${endDate}`);

  try {
    console.log(`[Data Fetch] Priority 1: Tushare`);
    const data = await fetchTushareRaw(tsCode, startDate, endDate, priceMode, dividendMode);
    if (data && data.length > 0) return data;
  } catch (e: any) {
    console.log(`[Data Fetch] Tushare failed or unavailable: ${e.message}`);
  }

  try {
    console.log(`[Data Fetch] Priority 2: EastMoney (东方财富)`);
    const data = await fetchEastmoneyKlines(tsCode, startDate, endDate, dividendMode);
    if (data && data.length > 0) return data;
  } catch (e: any) {
    console.log(`[Data Fetch] EastMoney failed: ${e.message}`);
  }

  try {
    console.log(`[Data Fetch] Priority 3: Sohu Finance (搜狐财经)`);
    const data = await fetchSohuRaw(tsCode, startDate, endDate, dividendMode);
    if (data && data.length > 0) return data;
  } catch (e: any) {
    console.log(`[Data Fetch] Sohu Finance failed: ${e.message}`);
  }

  try {
    console.log(`[Data Fetch] Priority 4: Sina Finance (新浪财经)`);
    const data = await fetchSinaRaw(tsCode, startDate, endDate, dividendMode);
    if (data && data.length > 0) return data;
  } catch (e: any) {
    console.log(`[Data Fetch] Sina Finance failed: ${e.message}`);
  }

  try {
    console.log(`[Data Fetch] Priority 5: Cninfo (巨潮资讯)`);
    const data = await fetchCninfoRaw(tsCode, startDate, endDate, dividendMode);
    if (data && data.length > 0) return data;
  } catch (e: any) {
    console.log(`[Data Fetch] Cninfo failed: ${e.message}`);
  }

  console.log(`[Data Fetch] All data sources failed. Returning empty array.`);
  return [];
}
