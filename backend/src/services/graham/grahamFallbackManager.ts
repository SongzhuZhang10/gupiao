import {
  GrahamBvpsRecord,
  GrahamEpsRecord,
  GrahamRoeRecord,
  GrahamStockDataProvider,
  GrahamStockSnapshot,
  MockGrahamDataProvider,
} from '../grahamDataProvider';
import {
  GrahamDataType,
  GrahamProviderAttempt,
  GrahamProviderConfig,
  GrahamProviderFallbackError,
  NamedGrahamProvider,
} from './grahamProviderTypes';
import {
  GRAHAM_PROVIDER_RETRY_DELAYS_MS,
  isTransientGrahamError,
  sleep,
} from './grahamRetry';

function priorityFor(
  config: GrahamProviderConfig,
  dataType: GrahamDataType,
  provider: NamedGrahamProvider['name']
): number {
  const index = config.priorities[dataType].indexOf(provider);
  return index >= 0 ? index + 1 : 999;
}

function byName(providers: NamedGrahamProvider[]): Map<NamedGrahamProvider['name'], NamedGrahamProvider> {
  return new Map(providers.map(provider => [provider.name, provider]));
}

function logAttempt(dataType: GrahamDataType, symbol: string, attempt: GrahamProviderAttempt) {
  const suffix = attempt.reason ? `: ${attempt.reason}` : '';
  console.log(
    `[GrahamFallback] ${dataType} ${symbol} ${attempt.provider} rank=${attempt.priorityRank} ${attempt.status}${suffix}`
  );
}

async function tryProviders<T>(
  dataType: GrahamDataType,
  symbol: string,
  config: GrahamProviderConfig,
  providers: NamedGrahamProvider[],
  invoke: (provider: NamedGrahamProvider) => Promise<T>,
  validate?: (value: T) => string | undefined
): Promise<T> {
  const providerMap = byName(providers);
  const attempts: GrahamProviderAttempt[] = [];

  for (const providerName of config.priorities[dataType]) {
    const provider = providerMap.get(providerName);
    if (!provider) continue;

    const rank = priorityFor(config, dataType, providerName);
    for (let retry = 0; retry <= GRAHAM_PROVIDER_RETRY_DELAYS_MS.length; retry += 1) {
      try {
        const value = await invoke(provider);
        const validationError = validate?.(value);
        if (validationError) {
          const attempt: GrahamProviderAttempt = {
            provider: providerName,
            accessLayer: provider.accessLayer,
            priorityRank: rank,
            status: 'invalid',
            reason: validationError,
          };
          attempts.push(attempt);
          logAttempt(dataType, symbol, attempt);
          break;
        }

        const attempt: GrahamProviderAttempt = {
          provider: providerName,
          accessLayer: provider.accessLayer,
          priorityRank: rank,
          status: 'success',
        };
        attempts.push(attempt);
        logAttempt(dataType, symbol, attempt);
        if (value && typeof value === 'object' && !Array.isArray(value) && !(value as { dataSource?: string }).dataSource) {
          (value as { dataSource?: string }).dataSource = providerName;
        }
        return value;
      } catch (error: unknown) {
        const delay = GRAHAM_PROVIDER_RETRY_DELAYS_MS[retry];
        if (isTransientGrahamError(error) && delay !== undefined) {
          await sleep(delay);
          continue;
        }
        const attempt: GrahamProviderAttempt = {
          provider: providerName,
          accessLayer: provider.accessLayer,
          priorityRank: rank,
          status: 'failed',
          reason: error instanceof Error ? error.message : String(error),
        };
        attempts.push(attempt);
        logAttempt(dataType, symbol, attempt);
        break;
      }
    }
  }

  if (config.enableMockFallback) {
    const mock = new MockGrahamDataProvider();
    try {
      const value = await invoke({
        name: 'mock',
        accessLayer: 'local_mock_graham_data',
        getStockSnapshot: stockCode => mock.getStockSnapshot(stockCode),
        getAdjustedEpsHistory: (stockCode, startYear, endYear) =>
          mock.getAdjustedEpsHistory(stockCode, startYear, endYear),
        getBvpsHistory: (stockCode, startYear, endYear) =>
          mock.getBvpsHistory(stockCode, startYear, endYear),
        getLatestRoe: stockCode => mock.getLatestRoe(stockCode),
      });
      const attempt: GrahamProviderAttempt = {
        provider: 'mock',
        accessLayer: 'local_mock_graham_data',
        priorityRank: 999,
        status: 'success',
        reason: 'explicit mock fallback enabled',
      };
      attempts.push(attempt);
      logAttempt(dataType, symbol, attempt);
      return value;
    } catch (error: unknown) {
      attempts.push({
        provider: 'mock',
        accessLayer: 'local_mock_graham_data',
        priorityRank: 999,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new GrahamProviderFallbackError(dataType, symbol, attempts);
}

export class FallbackGrahamDataProvider implements GrahamStockDataProvider {
  constructor(
    private readonly providers: NamedGrahamProvider[],
    private readonly config: GrahamProviderConfig
  ) {}

  async getStockSnapshot(stockCode: string): Promise<GrahamStockSnapshot> {
    return tryProviders(
      'snapshot',
      stockCode,
      this.config,
      this.providers,
      provider => provider.getStockSnapshot(stockCode),
      snapshot =>
        Number.isFinite(snapshot.currentPrice) && snapshot.currentPrice > 0
          ? undefined
          : 'invalid snapshot price'
    );
  }

  async getAdjustedEpsHistory(
    stockCode: string,
    startYear: number,
    endYear: number
  ): Promise<GrahamEpsRecord[]> {
    return tryProviders('eps_history', stockCode, this.config, this.providers, provider =>
      provider.getAdjustedEpsHistory(stockCode, startYear, endYear)
    );
  }

  async getBvpsHistory(
    stockCode: string,
    startYear: number,
    endYear: number
  ): Promise<GrahamBvpsRecord[]> {
    return tryProviders('bvps_history', stockCode, this.config, this.providers, provider =>
      provider.getBvpsHistory(stockCode, startYear, endYear)
    );
  }

  async getLatestRoe(stockCode: string): Promise<GrahamRoeRecord> {
    return tryProviders('roe', stockCode, this.config, this.providers, provider =>
      provider.getLatestRoe(stockCode)
    );
  }
}

export function createFallbackGrahamDataProvider(
  providers: NamedGrahamProvider[],
  config: GrahamProviderConfig
): GrahamStockDataProvider {
  return new FallbackGrahamDataProvider(providers, config);
}
