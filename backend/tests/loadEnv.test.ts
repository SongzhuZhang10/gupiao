import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('loadEnv', () => {
  it('backend .env documents VPN bypass domains for domestic data sources', () => {
    const envText = readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
    expect(envText).toMatch(/NO_PROXY=.*push2his\.eastmoney\.com/);
    expect(envText).toMatch(/NO_PROXY=.*push2delay\.eastmoney\.com/);
    expect(envText).toMatch(/NO_PROXY=.*datacenter-web\.eastmoney\.com/);
    expect(envText).toMatch(/PROVIDER_TIMEOUT_MS=8000/);
  });
});
