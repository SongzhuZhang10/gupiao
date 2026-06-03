const axios = require('axios');
const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' };

async function test() {
  try {
    const resEast = await axios.get('https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.600519&klt=101&fqt=0&beg=20230101&end=20240101&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55,f56,f57', { headers, timeout: 5000 });
    console.log('EastMoney K-line OK:', resEast.data.data.klines.length);
  } catch (e) {
    console.log('EastMoney K-line Error:', e.message);
  }
  
  try {
    const resSina = await axios.get('https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=sh600519&scale=240&ma=no&datalen=5', { headers, timeout: 5000 });
    console.log('Sina K-line OK:', resSina.data.length);
  } catch (e) {
    console.log('Sina K-line Error:', e.message);
  }
}
test();
