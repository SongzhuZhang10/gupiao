import { MarketRegion, parseMarketRegion } from '../utils/stock';

export interface ParsedDebugCommand {
  command: string;
  subcommand: string;
  options: Record<string, string | number | boolean>;
}

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`缺少 ${flag} 的值`);
  }
  return value;
}

export function parseDebugArgv(argv: string[]): ParsedDebugCommand {
  if (argv.length === 0) {
    throw new Error('缺少命令。示例: npm run debug -- graham probe --market us --code NVDA');
  }

  const [command, subcommand = 'help', ...rest] = argv;
  const options: Record<string, string | number | boolean> = {};

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith('--')) continue;

    const key = token.slice(2);
    if (key === 'json' || key === 'allow-mock-fallback' || key === 'skip-api') {
      options[key === 'skip-api' ? 'skipApi' : key] = true;
      continue;
    }

    const value = readFlagValue(rest, i, token);
    i += 1;

    if (key === 'market') {
      options.market = parseMarketRegion(value) as MarketRegion;
      continue;
    }
    if (key === 'start-year' || key === 'end-year') {
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) throw new Error(`${token} 必须是整数`);
      options[key === 'start-year' ? 'startYear' : 'endYear'] = parsed;
      continue;
    }
    if (key === 'y') {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('--y 必须是正数');
      options.y = parsed;
      continue;
    }
    if (key === 'code' || key === 'codes' || key === 'start' || key === 'end' || key === 'base-url' || key === 'overrides') {
      options[key === 'base-url' ? 'baseUrl' : key] = value;
      continue;
    }
    if (key === 'data-source') {
      options.dataSource = value;
      continue;
    }

    throw new Error(`未知参数: ${token}`);
  }

  return { command, subcommand, options };
}
