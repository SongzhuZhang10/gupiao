import { existsSync } from 'node:fs';

export function resolvePythonBin(): string {
  const configured = process.env.PYTHON_BIN?.trim();
  if (configured) {
    const looksLikePath = configured.includes('/') || configured.includes('\\');
    if (!looksLikePath || existsSync(configured)) {
      return configured;
    }
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}
