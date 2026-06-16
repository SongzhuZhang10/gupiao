import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePythonBin } from '../src/utils/resolvePythonBin';

describe('resolvePythonBin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('falls back to python on Windows when configured path does not exist', () => {
    vi.stubEnv('PYTHON_BIN', '/mnt/e/gupiao/backend/.venv/bin/python');
    Object.defineProperty(process, 'platform', { value: 'win32' });

    expect(resolvePythonBin()).toBe('python');
  });

  it('uses configured command when it is not a filesystem path', () => {
    vi.stubEnv('PYTHON_BIN', 'py -3.11');
    Object.defineProperty(process, 'platform', { value: 'win32' });

    expect(resolvePythonBin()).toBe('py -3.11');
  });

  it('defaults to python3 on non-Windows when PYTHON_BIN is unset', () => {
    vi.stubEnv('PYTHON_BIN', '');
    Object.defineProperty(process, 'platform', { value: 'linux' });

    expect(resolvePythonBin()).toBe('python3');
  });
});
