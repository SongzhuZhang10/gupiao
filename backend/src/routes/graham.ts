import { Router } from 'express';
import { GrahamValuationInput } from '../utils/grahamValuation';
import { GrahamRefreshPolicy } from '../services/graham/cachingGrahamDataProvider';
import {
  evaluateGrahamInputs,
  GrahamProviderFactory,
} from '../services/graham/evaluateGraham';
import { createGrahamDataProvider } from '../services/graham/createGrahamDataProvider';
import { GrahamStockDataProvider } from '../services/grahamDataProvider';
import { parseMarketRegion } from '../utils/stock';

const VALID_REFRESH_POLICIES: GrahamRefreshPolicy[] = ['default', 'fresh-prices'];

function parseRefreshPolicy(value: unknown): GrahamRefreshPolicy | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && VALID_REFRESH_POLICIES.includes(value as GrahamRefreshPolicy)) {
    return value as GrahamRefreshPolicy;
  }
  return null;
}

const router = Router();

const defaultProviderFactory: GrahamProviderFactory = (market, override) =>
  createGrahamDataProvider(market, undefined, override);

let providerFactory: GrahamProviderFactory = defaultProviderFactory;

export function setGrahamDataProviderFactoryForTests(
  factory: GrahamProviderFactory
) {
  providerFactory = factory;
}

export function resetGrahamDataProviderFactoryForTests() {
  providerFactory = defaultProviderFactory;
}

router.post('/evaluate', async (req, res) => {
  try {
    const { inputs, refreshPolicy: rawRefreshPolicy, cacheTtlHours } = req.body;
    if (!Array.isArray(inputs)) {
      return res.status(400).json({ error: 'inputs 必须是一个数组' });
    }

    const refreshPolicy = parseRefreshPolicy(rawRefreshPolicy);
    if (refreshPolicy === null) {
      return res.status(400).json({ error: "refreshPolicy 必须是 'default' 或 'fresh-prices'" });
    }

    const rows = await evaluateGrahamInputs(
      inputs,
      providerFactory === defaultProviderFactory ? undefined : providerFactory,
      { refreshPolicy, cacheTtlHours }
    );
    res.json({ rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '服务器内部错误';
    res.status(500).json({ error: message });
  }
});

export default router;
