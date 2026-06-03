import { fetchEastMoneyDividends } from './src/services/dataSources';

async function run() {
  const divs = await fetchEastMoneyDividends('600519.SH');
  console.log('Dividends:', divs.length);
  if (divs.length > 0) {
    console.log(divs.slice(0, 3));
  }
}
run();
