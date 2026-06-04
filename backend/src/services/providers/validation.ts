import {
  DataType,
  DailyBarRecord,
  DividendEventRecord,
  DividendYieldRecord,
  ProviderAttempt,
  ProviderFallbackError,
  ProviderName,
  RealtimeQuoteRecord,
  SourceMetadata,
} from './types';

interface NormalizeContext {
  logicalSource: ProviderName;
  accessLayer: string;
  symbol: string;
  rank: number;
  fallbackUsed: boolean;
  rawFieldMap: Record<string, string>;
  qualityFlags?: string[];
}

function marketFromSymbol(symbol: string): string {
  if (symbol.endsWith('.SH')) return 'SH';
  if (symbol.endsWith('.SZ')) return 'SZ';
  return 'UNKNOWN';
}

function metadata(ctx: NormalizeContext): SourceMetadata {
  return {
    logical_source: ctx.logicalSource,
    access_layer: ctx.accessLayer,
    retrieved_at: new Date().toISOString(),
    symbol: ctx.symbol,
    market: marketFromSymbol(ctx.symbol),
    source_priority_rank: ctx.rank,
    fallback_used: ctx.fallbackUsed,
    raw_field_map: ctx.rawFieldMap,
    quality_flags: ctx.qualityFlags ?? [],
  };
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value.replace(/,/g, ''));
  return NaN;
}

function getRawValue(raw: Record<string, unknown>, fieldMap: Record<string, string>, target: string): unknown {
  return raw[fieldMap[target] ?? target];
}

export function normalizeDailyBars(rawRows: Record<string, unknown>[], ctx: NormalizeContext): DailyBarRecord[] {
  return rawRows.map(raw => {
    const tradeDate = String(getRawValue(raw, ctx.rawFieldMap, 'trade_date') ?? '');
    const row: DailyBarRecord = {
      trade_date: tradeDate,
      open: asNumber(getRawValue(raw, ctx.rawFieldMap, 'open')),
      high: asNumber(getRawValue(raw, ctx.rawFieldMap, 'high')),
      low: asNumber(getRawValue(raw, ctx.rawFieldMap, 'low')),
      close: asNumber(getRawValue(raw, ctx.rawFieldMap, 'close')),
      volume: asNumber(getRawValue(raw, ctx.rawFieldMap, 'volume')),
      amount: Number.isFinite(asNumber(getRawValue(raw, ctx.rawFieldMap, 'amount'))) ? asNumber(getRawValue(raw, ctx.rawFieldMap, 'amount')) : undefined,
      metadata: metadata(ctx),
    };

    const vendorYield = asNumber(getRawValue(raw, ctx.rawFieldMap, 'vendor_dividend_yield'));
    if (Number.isFinite(vendorYield)) {
      row.vendor_dividend_yield = vendorYield;
      row.dividend_yield = vendorYield;
    }

    return row;
  });
}

export function validateDailyBarRecords(records: DailyBarRecord[]): string[] {
  if (!Array.isArray(records) || records.length === 0) return ['daily bars result is empty'];
  const errors: string[] = [];
  records.forEach((record, index) => {
    for (const field of ['trade_date', 'open', 'high', 'low', 'close', 'volume'] as const) {
      const value = record[field];
      if (value === undefined || value === null || value === '' || (typeof value === 'number' && !Number.isFinite(value))) {
        errors.push(`record ${index} missing or invalid ${field}`);
      }
    }
  });
  return errors;
}

export function validateRealtimeQuoteRecord(record: Partial<RealtimeQuoteRecord>): string[] {
  const errors: string[] = [];
  if (!record.symbol) errors.push('missing symbol');
  if (record.price === undefined && record.last === undefined) errors.push('missing price or last');
  if (record.timestamp === undefined && record.quote_time === undefined) errors.push('missing timestamp or quote_time');
  return errors;
}

export function validateDividendEventRecords(records: DividendEventRecord[]): string[] {
  if (!Array.isArray(records) || records.length === 0) return ['dividend events result is empty'];
  const errors: string[] = [];
  records.forEach((record, index) => {
    if (!record.symbol) errors.push(`record ${index} missing symbol`);
    if (!record.ex_date && !record.announcement_date && !record.record_date) {
      errors.push(`record ${index} missing ex_date, announcement_date, or record_date`);
    }
    if (record.cash_dividend === undefined && !record.dividend_description) {
      errors.push(`record ${index} missing cash_dividend or dividend_description`);
    }
  });
  return errors;
}

export function validateDividendYieldRecord(record: Partial<DividendYieldRecord>): string[] {
  const errors: string[] = [];
  if (!record.symbol) errors.push('missing symbol');
  if (!record.as_of_date) errors.push('missing as_of_date');
  if (record.dividend_per_share === undefined && record.trailing_cash_dividend === undefined) {
    errors.push('missing dividend_per_share or trailing_cash_dividend');
  }
  if (record.reference_price === undefined || !Number.isFinite(record.reference_price)) errors.push('missing reference_price');
  if (record.dividend_yield === undefined || !Number.isFinite(record.dividend_yield)) errors.push('missing dividend_yield');
  if (!record.calculation_method) errors.push('missing calculation_method');
  return errors;
}

export function createProviderError(dataType: DataType, symbol: string, attempts: ProviderAttempt[]): ProviderFallbackError {
  return new ProviderFallbackError(dataType, symbol, attempts);
}

export function calculateDividendYield(input: {
  symbol: string;
  asOfDate: string;
  referencePrice: number;
  dividendEvents: DividendEventRecord[];
  priceMetadata: SourceMetadata;
  vendorDividendYield?: number;
  tolerance: number;
  dividendMode?: string;
}): DividendYieldRecord {
  const asOfTime = new Date(input.asOfDate).getTime();
  const trailingStart = asOfTime - 365 * 24 * 60 * 60 * 1000;
  const dividendMode = input.dividendMode === 'dv_ratio' ? 'dv_ratio' : 'dv_ttm';
  const annualAnchorYear = new Date(input.asOfDate).getFullYear() - 1;
  const cashDividendPerShare = input.dividendEvents.reduce((sum, event) => {
    const eventDate = event.ex_date ?? event.record_date ?? event.announcement_date;
    const eventTime = eventDate ? new Date(eventDate).getTime() : NaN;
    if (!Number.isFinite(eventTime) || eventTime > asOfTime) return sum;
    if (dividendMode === 'dv_ttm' && eventTime <= trailingStart) return sum;
    if (dividendMode === 'dv_ratio' && new Date(eventTime).getFullYear() !== annualAnchorYear) return sum;
    return sum + (event.cash_dividend ?? 0);
  }, 0);
  const calculatedYield = Number(((cashDividendPerShare / input.referencePrice) * 100).toFixed(4));
  const qualityFlags = [...input.priceMetadata.quality_flags];

  if (input.vendorDividendYield !== undefined && Number.isFinite(input.vendorDividendYield)) {
    const denominator = Math.max(Math.abs(calculatedYield), 0.0001);
    const relativeDiff = Math.abs(input.vendorDividendYield - calculatedYield) / denominator;
    if (relativeDiff > input.tolerance) {
      qualityFlags.push('needs_review', 'vendor_yield_disagreement');
    }
  }

  return {
    symbol: input.symbol,
    as_of_date: input.asOfDate,
    trailing_cash_dividend: Number(cashDividendPerShare.toFixed(4)),
    reference_price: input.referencePrice,
    dividend_yield: calculatedYield,
    vendor_dividend_yield: input.vendorDividendYield,
    calculated_dividend_yield: calculatedYield,
    calculation_method: dividendMode === 'dv_ratio'
      ? 'internal_annual_anchored_cash_dividend/unadjusted_close'
      : 'internal_ttm_cash_dividend/unadjusted_close',
    quality_flags: Array.from(new Set(qualityFlags)),
    metadata: {
      ...input.priceMetadata,
      logical_source: input.dividendEvents[0]?.metadata.logical_source ?? input.priceMetadata.logical_source,
      access_layer: 'internal_calculation',
      raw_field_map: {
        dividend: 'dividend_events.cash_dividend',
        reference_price: 'daily_bars.unadjusted_close',
      },
      quality_flags: Array.from(new Set(qualityFlags)),
    },
  };
}
