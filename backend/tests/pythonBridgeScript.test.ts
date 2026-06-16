import { describe, expect, it } from 'vitest';
import { buildPythonBridgeScript } from '../src/services/providers/pythonBridgeScript';

describe('buildPythonBridgeScript', () => {
  const script = buildPythonBridgeScript();

  it('implements akshare daily bars via stock_zh_a_hist with sina fallback', () => {
    expect(script).toContain('ak.stock_zh_a_hist');
    expect(script).toContain('ak.stock_zh_a_daily');
    expect(script).toContain('def sina_daily_rows(payload)');
    expect(script).toContain('def run_akshare(action, payload)');
  });

  it('falls back to sina daily bars for baostock, cninfo, and tushare without token', () => {
    expect(script).toContain('return sina_daily_rows(payload)');
    expect(script).toContain('if action == "daily_bars":');
    expect(script).toMatch(/run_baostock[\s\S]*sina_daily_rows/);
    expect(script).toMatch(/run_cninfo[\s\S]*daily_bars[\s\S]*sina_daily_rows/);
  });

  it('implements cninfo and akshare dividend events via stock_dividend_cninfo', () => {
    expect(script).toContain('ak.stock_dividend_cninfo');
    expect(script).toContain('def run_cninfo(action, payload)');
  });

  it('implements tushare daily bars and dividend events with token check', () => {
    expect(script).toContain('import tushare as ts');
    expect(script).toContain('TUSHARE_TOKEN 未配置');
    expect(script).toContain('pro.daily(');
    expect(script).toContain('pro.dividend(ts_code=code)');
  });

  it('routes providers through envelope payload', () => {
    expect(script).toContain('envelope["_provider"]');
    expect(script).toContain('elif provider == "tushare"');
  });
});
