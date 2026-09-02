import { chromium } from '@playwright/test';

const wait = async (url) => {
  for (let i = 0; i < 90; i++) {
    try {
      await fetch(url);
      return;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
};
await wait('http://localhost:9000/health');
await wait('http://localhost:8000/');

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const seller = await browser.newContext({ viewport: { width: 1100, height: 850 } });
const page = await seller.newPage();

const stamp = Date.now();
await page.goto('http://localhost:8000/', { waitUntil: 'networkidle' });
await page.selectOption('select[aria-label="Language"]', 'en');
await page.waitForTimeout(1200);

// 1. 企業をつくる
await page.getByRole('button', { name: 'Sign up' }).click();
await page.waitForTimeout(600);
await page.fill('#organization-name', `Bright Studio ${stamp}`);
await page.fill('#password', 'good-password-1234');
await page.screenshot({ path: 'tmp/walk/1-signup.png' });
await page.getByRole('button', { name: 'Create company' }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: 'tmp/walk/2-credentials.png' });
await page.getByRole('button', { name: 'Saved them, go to the market' }).click();
await page.waitForTimeout(2000);

// 2. 商品を出す
await page.getByRole('button', { name: 'My products' }).first().click();
await page.waitForTimeout(1200);
await page.fill('#title', 'Poster design for a school festival');
await page.fill('#description', 'We design an A2 poster that people notice from far away.');
await page.fill('#target_customer', 'Companies that run an event and need people to come');
await page.fill('#problem_solved', 'Nobody notices the event because the poster is hard to read');
await page.fill('#price', '3200');
await page.fill('#available_quantity', '5');
await page.fill('#image_url', 'https://example.com/poster.png');
await page.fill('#sale_starts_at', '2026-01-01');
await page.fill('#sale_ends_at', '2099-12-31');
await page.screenshot({ path: 'tmp/walk/3-listing-form.png' });
await page.getByRole('button', { name: 'List it' }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: 'tmp/walk/4-listed.png' });

// 3. 別の企業が買う
const buyerContext = await browser.newContext({ viewport: { width: 1100, height: 850 } });
const buyer = await buyerContext.newPage();
await buyer.goto('http://localhost:8000/', { waitUntil: 'networkidle' });
await buyer.selectOption('select[aria-label="Language"]', 'en');
await buyer.waitForTimeout(1000);
await buyer.getByRole('button', { name: 'Sign up' }).click();
await buyer.waitForTimeout(600);
await buyer.fill('#organization-name', `Green Events ${stamp}`);
await buyer.fill('#password', 'good-password-1234');
await buyer.getByRole('button', { name: 'Create company' }).click();
await buyer.waitForTimeout(2000);
await buyer.getByRole('button', { name: 'Saved them, go to the market' }).click();
await buyer.waitForTimeout(2500);

const card = buyer
  .locator('article')
  .filter({ hasText: 'Poster design for a school festival' })
  .first();
await card.getByRole('button', { name: 'View details' }).click();
await buyer.waitForTimeout(1500);
await buyer.screenshot({ path: 'tmp/walk/5-detail.png' });
await buyer.getByRole('button', { name: 'Buy' }).click();
await buyer.waitForTimeout(2000);
await buyer.screenshot({ path: 'tmp/walk/6-purchased.png' });

// 4. 売った側が経営を見る
await page.getByRole('button', { name: 'Business' }).first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: 'tmp/walk/7-dashboard.png' });

await browser.close();
console.log('撮りました');
