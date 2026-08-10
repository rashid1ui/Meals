const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    
    console.log("Navigating...");
    await page.goto('https://gym-meals-six.vercel.app/', { waitUntil: 'networkidle0' });
    
    console.log("Checking UI state...");
    const loadingDisplay = await page.$eval('#loading-screen', el => window.getComputedStyle(el).display);
    const authDisplay = await page.$eval('#auth-screen', el => window.getComputedStyle(el).display);
    
    console.log("Loading screen display:", loadingDisplay);
    console.log("Auth screen display:", authDisplay);
    
    await browser.close();
  } catch(e) {
    console.error("Test failed:", e);
  }
})();
