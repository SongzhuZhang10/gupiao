import express from 'express';
import stocksRouter from './src/routes/stocks';

const app = express();
app.use('/api/stocks', stocksRouter);
app.listen(3001, () => {
  console.log('Test server running');
});
