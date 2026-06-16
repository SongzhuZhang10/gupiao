import './loadEnv';
import express from 'express';
import cors from 'cors';
import stocksRouter from './routes/stocks';
import cacheRouter from './routes/cache';
import grahamRouter from './routes/graham';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'gupiao-backend',
    ts: new Date().toISOString(),
    features: {
      secRoe: true,
      secEps: true,
    },
  });
});

app.use('/api/stocks', stocksRouter);
app.use('/api/cache', cacheRouter);
app.use('/api/graham', grahamRouter);

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
