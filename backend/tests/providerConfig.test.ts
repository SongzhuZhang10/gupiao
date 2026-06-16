import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProviderConfig } from '../src/services/providers/config';

describe('provider config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps configured timeout in test environment', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PROVIDER_TIMEOUT_MS', '3000');
    expect(getProviderConfig('cn').timeoutMs).toBe(3000);
  });

  it('enforces minimum CN timeout for VPN/proxy environments in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PROVIDER_TIMEOUT_MS', '3000');
    expect(getProviderConfig('cn').timeoutMs).toBe(8000);
  });

  it('enforces minimum US timeout in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PROVIDER_TIMEOUT_MS', '3000');
    expect(getProviderConfig('us').timeoutMs).toBe(15000);
  });
});
