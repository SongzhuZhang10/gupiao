import { spawn } from 'child_process';
import { ProviderName } from './types';

export async function runPythonProvider<T>(
  provider: ProviderName,
  action: string,
  payload: Record<string, unknown>,
  timeoutMs: number
): Promise<T> {
  if (process.env.NODE_ENV === 'test' && process.env.ALLOW_LIVE_PROVIDER_TESTS !== 'true') {
    throw new Error(`${provider} python bridge disabled in test environment`);
  }

  const script = `
import json
import sys

provider = ${JSON.stringify(provider)}
action = ${JSON.stringify(action)}
payload = json.loads(sys.stdin.read())

try:
    if provider == "baostock":
        import baostock as bs
        if action != "daily_bars":
            raise RuntimeError("unsupported baostock action")
        symbol = payload["symbol"]
        code = ("sh." if symbol.endswith(".SH") else "sz.") + symbol[:6]
        lg = bs.login()
        if lg.error_code != "0":
            raise RuntimeError(lg.error_msg)
        rs = bs.query_history_k_data_plus(
            code,
            "date,open,high,low,close,volume,amount",
            start_date=payload["startDate"],
            end_date=payload["endDate"],
            frequency="d",
            adjustflag="3"
        )
        rows = []
        while rs.next():
            rows.append(dict(zip(rs.fields, rs.get_row_data())))
        bs.logout()
        print(json.dumps(rows, ensure_ascii=False))
    elif provider in ("akshare_generic", "cninfo"):
        import akshare as ak
        raise RuntimeError(f"{provider} {action} bridge is not configured for this project")
    else:
        raise RuntimeError(f"unsupported provider {provider}")
except Exception as exc:
    print(json.dumps({"error": str(exc)}, ensure_ascii=False))
    sys.exit(1)
`;

  return await new Promise<T>((resolve, reject) => {
    const child = spawn(process.env.PYTHON_BIN || 'python3', ['-c', script], {
      stdio: ['pipe', 'pipe', 'pipe'],
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
    child.stdin.end(JSON.stringify(payload));
  });
}
