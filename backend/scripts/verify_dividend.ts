import { fetchTushareData } from '../src/services/tushare';

async function verify() {
  const tsCode = '601398.SH';
  
  console.log(`\n--- Verifying Dividend Yields for ${tsCode} (Sohu Fallback Mode) ---\n`);

  // We will check July and August 2024. 
  // ICBC Mock Dividends: 
  // 2024-07-16: 0.306
  // 2023-07-17: 0.308

  // Case 1: 2024-07-01 (Before 2024 dividend)
  // Static: 2023 full year sum -> 0.308
  // TTM: 2023-07-02 to 2024-07-01 -> includes 2023-07-17 (0.308)
  console.log('Fetching Static (dv_ratio) for early July (2024-07-01 to 2024-07-05)...');
  const dataStaticJuly = await fetchTushareData(tsCode, '2024-07-01', '2024-07-05', 'unadjusted', 'dv_ratio');
  const staticYield = dataStaticJuly.find(d => d.trade_date === '2024-07-01');
  console.log(`[2024-07-01] Static: Price = ${staticYield?.close}, Yield = ${staticYield?.dividend_yield}%`);
  // Expected Yield: (0.308 / Price) * 100

  console.log('\nFetching TTM (dv_ttm) for early July (2024-07-01 to 2024-07-05)...');
  const dataTtmJuly = await fetchTushareData(tsCode, '2024-07-01', '2024-07-05', 'unadjusted', 'dv_ttm');
  const ttmYield = dataTtmJuly.find(d => d.trade_date === '2024-07-01');
  console.log(`[2024-07-01] TTM   : Price = ${ttmYield?.close}, Yield = ${ttmYield?.dividend_yield}%`);
  // Expected Yield: (0.308 / Price) * 100

  // Case 2: 2024-08-01 (After 2024 dividend)
  // Static: 2023 full year sum -> 0.308 (Still 2023, because 2024 hasn't ended yet)
  // TTM: 2023-08-02 to 2024-08-01 -> includes 2024-07-16 (0.306)
  console.log('\nFetching Static (dv_ratio) for early August (2024-08-01 to 2024-08-05)...');
  const dataStaticAug = await fetchTushareData(tsCode, '2024-08-01', '2024-08-05', 'unadjusted', 'dv_ratio');
  const staticYieldAug = dataStaticAug.find(d => d.trade_date === '2024-08-01');
  console.log(`[2024-08-01] Static: Price = ${staticYieldAug?.close}, Yield = ${staticYieldAug?.dividend_yield}%`);
  // Expected Yield: (0.308 / Price) * 100

  console.log('\nFetching TTM (dv_ttm) for early August (2024-08-01 to 2024-08-05)...');
  const dataTtmAug = await fetchTushareData(tsCode, '2024-08-01', '2024-08-05', 'unadjusted', 'dv_ttm');
  const ttmYieldAug = dataTtmAug.find(d => d.trade_date === '2024-08-01');
  console.log(`[2024-08-01] TTM   : Price = ${ttmYieldAug?.close}, Yield = ${ttmYieldAug?.dividend_yield}%`);
  // Expected Yield: (0.306 / Price) * 100
  
  console.log('\n--- Calculation Check ---');
  if (staticYield?.close && staticYield.dividend_yield) {
    console.log(`[2024-07-01 Static Math]: (0.308 / ${staticYield.close}) * 100 = ${((0.308 / staticYield.close) * 100).toFixed(2)}% (Matches ${staticYield.dividend_yield}?)`);
  }
  if (ttmYieldAug?.close && ttmYieldAug.dividend_yield) {
    console.log(`[2024-08-01 TTM Math]   : (0.306 / ${ttmYieldAug.close}) * 100 = ${((0.306 / ttmYieldAug.close) * 100).toFixed(2)}% (Matches ${ttmYieldAug.dividend_yield}?)`);
  }
}

verify().catch(console.error);
