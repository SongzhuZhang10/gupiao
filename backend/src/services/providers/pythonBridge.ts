import { spawn } from 'child_process';
import { resolvePythonBin } from '../../utils/resolvePythonBin';
import { ProviderName } from './types';
import { buildPythonBridgeScript } from './pythonBridgeScript';

export async function runPythonProvider<T>(
  provider: ProviderName,
  action: string,
  payload: Record<string, unknown>,
  timeoutMs: number
): Promise<T> {
  if (process.env.NODE_ENV === 'test' && process.env.ALLOW_LIVE_PROVIDER_TESTS !== 'true') {
    throw new Error(`${provider} python bridge disabled in test environment`);
  }

  const script = buildPythonBridgeScript();
  const stdinPayload = JSON.stringify({
    _provider: provider,
    _action: action,
    _payload: payload,
  });

  return await new Promise<T>((resolve, reject) => {
    const child = spawn(resolvePythonBin(), ['-c', script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${provider} python bridge timed out`));
    }, timeoutMs);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        try {
          const parsed = JSON.parse(stdout);
          reject(new Error(parsed.error || stderr || `${provider} python bridge failed`));
        } catch {
          reject(new Error(stderr || `${provider} python bridge failed`));
        }
        return;
      }
      try {
        resolve(JSON.parse(stdout) as T);
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(stdinPayload);
  });
}
