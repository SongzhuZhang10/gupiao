import { Router } from 'express';
import { clearStockDataCache } from '../services/stockCache';

const router = Router();

router.delete('/stocks', async (_req, res) => {
  try {
    await clearStockDataCache();
    res.json({
      success: true,
      message: 'Stock data cache cleared successfully.',
    });
  } catch (error) {
    console.error('清除股票数据缓存失败', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear stock data cache.',
    });
  }
});

export default router;
