import { fetchHistoricalData } from './src/services/dataSources';

async function run() {
  const data = await fetchHistoricalData('600519', '2010-01-01', '2026-06-03', 'unadjusted', 'dv_ttm');
  console.log('Fetched samples:', data?.length);
}
run();
