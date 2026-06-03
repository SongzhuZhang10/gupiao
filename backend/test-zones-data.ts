import { fetchHistoricalData } from './src/services/dataSources';

async function run() {
  const tsCode = '000001.SZ';
  const endDate = '2026-06-03';
  const startDate = '2016-06-03'; // 10 years ago
  try {
    const dailyData = await fetchHistoricalData(
      tsCode,
      startDate,
      endDate,
      'unadjusted',
      'dv_ttm'
    );
    console.log(`Fetched dailyData length: ${dailyData?.length}`);
    const validSamples = dailyData.filter(d => 
      d.close !== undefined && d.close > 0 && d.dividend_yield !== undefined
    );
    console.log(`Valid samples: ${validSamples.length}`);
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

run();
