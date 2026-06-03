import axios from 'axios';

async function run() {
  try {
    const res = await axios.get('http://localhost:3000/api/stocks/600519/history?startDate=2020-01-01&endDate=2024-01-01&priceMode=unadjusted&dividendMode=dv_ttm');
    console.log('History data points:', res.data.points?.length);
  } catch (err: any) {
    console.error('History API Error:', err.message, err.response?.data);
  }
}

run();
