import axios from 'axios';

async function run() {
  const tsCode = '600519.SH';
  const startDate = '2021-06-03';
  const endDate = '2026-06-03';

  console.log('Sending requests concurrently...');
  const req1 = axios.get(`http://localhost:3000/api/stocks/600519/history?startDate=${startDate}&endDate=${endDate}`);
  const req2 = axios.get(`http://localhost:3000/api/stocks/600519/dividend-yield-zones?startDate=${startDate}&endDate=${endDate}&lookbackYears=10`);

  try {
    const [res1, res2] = await Promise.all([req1, req2]);
    console.log('Req1 points:', res1.data.points?.length);
    console.log('Req2 zones:', res2.data.zones?.length);
  } catch (err: any) {
    console.error('Error:', err.response?.data || err.message);
  }
}

run();
