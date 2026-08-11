const puppeteer = require('puppeteer-core');

(async () => {
  try {
    const browser = await puppeteer.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: "new"
    });
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
    
    console.log("Navigating to production site...");
    await page.goto('https://gym-meals-six.vercel.app/', { waitUntil: 'networkidle0' });
    
    const loadingDisplay = await page.$eval('#loading-screen', el => window.getComputedStyle(el).display);
    const authDisplay = await page.$eval('#auth-screen', el => window.getComputedStyle(el).display);
    
    console.log("Loading screen display:", loadingDisplay);
    console.log("Auth screen display:", authDisplay);
    
    await browser.close();
  } catch(e) {
    console.error("Test failed:", e);
  }
})();
