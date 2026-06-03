import puppeteer from 'puppeteer';

async function runTest() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  console.log('Navigating to http://localhost:5173...');
  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
    console.log('Page loaded.');
  } catch (err: any) {
    console.error('Failed to load page:', err.message);
    await browser.close();
    return;
  }

  // Type stock code
  console.log('Typing stock code...');
  await page.type('#stockCode', '600519');

  // Click submit
  console.log('Clicking submit...');
  await page.click('button[type="submit"]');

  console.log('Waiting for network requests to finish...');
  try {
    await page.waitForResponse(response => response.url().includes('/api/stocks/'), { timeout: 10000 });
    // Wait a bit more for rendering
    await new Promise(r => setTimeout(r, 2000));
  } catch (err: any) {
    console.log('Timeout waiting for response.');
  }

  // Check if chart is rendered
  const hasChart = await page.evaluate(() => {
    return !!document.querySelector('.echarts-for-react');
  });
  console.log('Chart rendered:', hasChart);

  // Check if there are any error messages
  const errorMessages = await page.evaluate(() => {
    const alerts = document.querySelectorAll('.ant-message-custom-content span:last-child');
    return Array.from(alerts).map(el => el.textContent);
  });
  console.log('Toast Errors:', errorMessages);

  await browser.close();
}

runTest();
