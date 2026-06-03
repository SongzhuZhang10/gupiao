import { fetchHistoricalData } from './src/services/dataSources';

async function run() {
  const data = await fetchHistoricalData('600519', '2020-01-01', '2024-01-01', 'unadjusted', 'dv_ttm');
  console.log('Fetched samples:', data?.length);
}
run();
