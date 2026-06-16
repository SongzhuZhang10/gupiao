import dotenv from 'dotenv';
import path from 'node:path';

/**
 * Load backend/.env regardless of process cwd (root npm run dev vs cd backend).
 * VPN / proxy bypass (NO_PROXY) and TLS settings must be set before any HTTP client runs.
 */
export function loadBackendEnv(): void {
  if (process.env.NODE_ENV === 'test') return;
  const envPath = path.resolve(__dirname, '../.env');
  dotenv.config({ path: envPath });
}

loadBackendEnv();
