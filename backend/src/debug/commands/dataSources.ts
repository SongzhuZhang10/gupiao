import { DebugReport, DebugStepReport } from '../format';
import { createInnerGrahamDataProvider } from '../../services/graham/createGrahamDataProvider';
import { normalizeStockCode } from '../../utils/stock';

const DEFAULT_OVERRIDES = [
  '',
  'eastmoney',
  'sina',
  'akshare_generic',
  'baostock',
  'cninfo',
  'tushare',
  'sohu',
];

interface DataSourcesProbeOptions {
  code?: string;
  overrides?: string;
}

function overrideLabel(override: string): string {
  return override || 'auto';
}

function parseOverrides(overrides?: string): string[] {
  if (!overrides?.trim()) {
    return DEFAULT_OVERRIDES;
  }
  return overrides.split(',').map(token => {
    const trimmed = token.trim();
    return trimmed === 'auto' ? '' : trimmed;
  });
}

export async function runDataSourcesProbe(options: DataSourcesProbeOptions = {}): Promise<DebugReport> {
  const started = Date.now();
  const code = normalizeStockCode(String(options.code ?? '600519.SH'), 'cn');
  const overrides = parseOverrides(options.overrides);
  const steps: DebugStepReport[] = [];

  for (const override of overrides) {
    const stepStarted = Date.now();
    const name = `override:${overrideLabel(override)}`;
    try {
      const provider = createInnerGrahamDataProvider('cn', override || undefined);
      const snapshot = await provider.getStockSnapshot(code);
      steps.push({
        name,
        ok: true,
        durationMs: Date.now() - stepStarted,
        data: {
          price: snapshot.currentPrice,
          dataSource: snapshot.dataSource,
          priceAsOfDate: snapshot.priceAsOfDate,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      steps.push({
        name,
        ok: false,
        durationMs: Date.now() - stepStarted,
        error: message,
      });
    }
  }

  const ok = steps.some(step => step.ok);

  return {
    command: 'data-sources.probe',
    ok,
    durationMs: Date.now() - started,
    data: {
      code,
      overrides: overrides.map(overrideLabel),
    },
    steps,
    error: ok ? undefined : { message: '所有数据源均失败' },
  };
}
