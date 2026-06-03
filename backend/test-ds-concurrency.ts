import { fetchHistoricalData } from './src/services/dataSources';

async function run() {
  const req1 = fetchHistoricalData('600519.SH', '2021-01-01', '2024-01-01', 'unadjusted', 'dv_ttm');
  const req2 = fetchHistoricalData('600519.SH', '2014-01-01', '2024-01-01', 'unadjusted', 'dv_ttm');
  const [res1, res2] = await Promise.all([req1, req2]);
  console.log('Res1 length:', res1.length);
  console.log('Res2 length:', res2.length);
}

run();
