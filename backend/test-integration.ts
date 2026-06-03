import axios from 'axios';
import express from 'express';
import stocksRouter from './src/routes/stocks';
import http from 'http';

const app = express();
app.use('/api/stocks', stocksRouter);
const server = http.createServer(app);

server.listen(3002, async () => {
  console.log('Server started on 3002');
  try {
    const stockCode = '600519';
    const startDate = '2020-01-01';
    const endDate = '2024-01-01';
    const lookbackYears = 10;
    
    console.log('Fetching history...');
    const historyRes = await axios.get(`http://localhost:3002/api/stocks/${stockCode}/history`, {
      params: { startDate, endDate, priceMode: 'forward', dividendMode: 'dv_ttm' }
    });
    console.log('History data points:', historyRes.data.points?.length);

    console.log('Fetching zones...');
    let zonesError = null;
    const zonesRes = await axios.get(`http://localhost:3002/api/stocks/${stockCode}/dividend-yield-zones`, {
      params: { startDate, endDate, lookbackYears, dividendBasis: 'pre_tax' }
    }).catch(err => {
      zonesError = err.response?.data?.error || err.message;
      return null;
    });

    const data = historyRes.data;
    const zonesData = zonesRes ? zonesRes.data : null;

    console.log('zonesError:', zonesError);
    console.log('zonesData available:', !!zonesData);

    // Simulate combinedChartOption
    const showZones = true;
    const markArea = showZones && zonesData && !zonesError ? {
      silent: true,
      data: zonesData.zones.map((z: any) => {
        let color = '';
        if (z.id === 'strong_buy') color = 'rgba(0, 128, 0, 0.15)';
        else if (z.id === 'add') color = 'rgba(144, 238, 144, 0.15)';
        else if (z.id === 'hold') color = 'rgba(128, 128, 128, 0.1)';
        else if (z.id === 'reduce') color = 'rgba(255, 165, 0, 0.15)';
        else if (z.id === 'exit') color = 'rgba(255, 0, 0, 0.15)';
        return [
          { 
            yAxis: z.yMin !== null ? z.yMin : 'min', 
            itemStyle: { color }, 
            name: z.label, 
            label: { position: 'insideRight', color: 'rgba(0,0,0,0.4)', fontSize: 12 } 
          },
          { yAxis: z.yMax !== null ? z.yMax : 'max' }
        ];
      })
    } : undefined;

    console.log('markArea evaluated successfully:', !!markArea);
    if (markArea) {
      console.log('markArea data length:', markArea.data.length);
      console.log('markArea data[0]:', markArea.data[0]);
    }

    console.log('Test passed successfully.');
  } catch (err: any) {
    console.error('Test failed:', err.message);
  } finally {
    server.close();
  }
});
