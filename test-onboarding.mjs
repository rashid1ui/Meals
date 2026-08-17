import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Listen to console and page errors
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));

  console.log('Navigating to http://localhost:3000/onboarding');
  await page.goto('http://localhost:3000/onboarding', { waitUntil: 'networkidle2' });

  // Try to bypass login if redirected (Assuming we need to login or we are already logged in)
  // Our application middleware redirects to /login if no user. We need to login if redirected.
  const url = page.url();
  if (url.includes('/login')) {
    console.log('Redirected to login. Logging in...');
    await page.type('input[name="email"]', 'test@example.com');
    await page.type('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
  }

  // Verify we are on onboarding
  if (!page.url().includes('/onboarding')) {
    console.log('Failed to reach onboarding! Currently at:', page.url());
    // Force goto onboarding
    await page.goto('http://localhost:3000/onboarding', { waitUntil: 'networkidle2' });
  }

  console.log('Currently at:', page.url());

  // Step 1: Macros
  console.log('Step 1: Clicking Continue...');
  await page.click('button:has-text("Continue")');
  await new Promise(r => setTimeout(r, 1000));

  // Step 2: Proteins
  console.log('Step 2: Selecting Protein...');
  const proteinButtons = await page.$$('button.p-4');
  if (proteinButtons.length > 0) {
    await proteinButtons[0].click();
  } else {
    console.log('No protein buttons found!');
  }
  await page.click('button:has-text("Continue")');
  await new Promise(r => setTimeout(r, 1000));

  // Step 3: Carbs
  console.log('Step 3: Selecting Carb...');
  const carbButtons = await page.$$('button.p-4');
  if (carbButtons.length > 0) {
    await carbButtons[0].click();
  } else {
    console.log('No carb buttons found!');
  }
  await page.click('button:has-text("Continue")');
  await new Promise(r => setTimeout(r, 1000));

  // Step 4: Fats
  console.log('Step 4: Selecting Fat...');
  const fatButtons = await page.$$('button.p-4');
  if (fatButtons.length > 0) {
    await fatButtons[0].click();
  } else {
    console.log('No fat buttons found!');
  }
  
  console.log('Waiting 2 seconds on Step 4...');
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('Clicking Generate Meal Plan...');
  await page.click('button:has-text("Generate Meal Plan")');
  
  console.log('Waiting for generation response...');
  await new Promise(r => setTimeout(r, 15000));

  console.log('Done test script.');
  await browser.close();
})();
