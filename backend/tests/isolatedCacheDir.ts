import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

let currentDir = '';

export function getIsolatedCacheDir(): string {
  return currentDir;
}

export async function setupIsolatedCacheDir(): Promise<void> {
  currentDir = path.join(os.tmpdir(), `gupiao-cache-${randomUUID()}`);
  process.env.GUPAO_CACHE_DIR = currentDir;
  await fs.rm(currentDir, { recursive: true, force: true });
}

export async function teardownIsolatedCacheDir(): Promise<void> {
  delete process.env.GUPAO_CACHE_DIR;
  if (currentDir) {
    await fs.rm(currentDir, { recursive: true, force: true });
    currentDir = '';
  }
}
