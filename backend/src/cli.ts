import './loadEnv';
import { fetchHistoricalData } from './services/dataSources';
import { sampleWeeklyData } from './utils/sampling';
import { normalizeStockCode } from './utils/stock';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log('用法: npx ts-node src/cli.ts <股票代码> <开始日期> <结束日期>');
    process.exit(1);
  }

  const [rawCode, startDate, endDate] = args;
  const tsCode = normalizeStockCode(rawCode);

  console.log(`\n正在获取 ${tsCode} 从 ${startDate} 到 ${endDate} 的数据...\n`);

  try {
    const dailyData = await fetchHistoricalData(tsCode, startDate, endDate, 'forward', 'dv_ttm');
    const sampledData = sampleWeeklyData(dailyData, 'dv_ttm');

    console.log('--- 采样输出 ---');
    console.table(sampledData.map(p => ({
      '周次': p.week,
      '采样日期': p.sampleDate,
      '价格': p.price,
      '股息率': p.dividendYield + '%'
    })));
  } catch (error) {
    console.error('测试失败:', error);
  }
}

main();
