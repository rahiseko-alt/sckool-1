import { chromium } from '@playwright/test';
const BASE = 'http://localhost:8000';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser
  .newContext({ viewport: { width: 1280, height: 900 } })
  .then((c) => c.newPage());
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
page.on('response', (r) => {
  if (r.url().includes('/store/') || r.url().includes('/auth/'))
    console.log('RESP', r.status(), r.url());
});
await page.goto(BASE);
await page.evaluate(() => localStorage.setItem('sckool.locale', 'en'));
await page.reload();
await page.waitForTimeout(500);
await page
  .getByRole('button', { name: /sign ?up/i })
  .first()
  .click();
await page.waitForTimeout(300);
console.log(
  'inputs present:',
  await page.locator('#organization-name').count(),
  await page.locator('#password').count(),
);
const org = 'AUDIT ' + Math.random().toString(36).slice(2, 7).toUpperCase();
await page.fill('#organization-name', org);
await page.fill('#password', 'auditpass123');
console.log('submit buttons:', await page.locator('form button[type=submit]').count());
await page.locator('form button[type=submit]').click();
await page.waitForTimeout(2500);
const body = await page.textContent('body');
console.log('MKT match:', (body.match(/MKT-[A-Z0-9]{4}-[A-Z0-9]{4}/) || [])[0]);
console.log('body snippet:', body.slice(0, 400).replace(/\s+/g, ' '));
await browser.close();
