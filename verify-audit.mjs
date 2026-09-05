import { chromium } from '@playwright/test';

const BASE = 'http://localhost:8000';
const JP = /[぀-ゟ゠-ヿ]/; // hiragana + katakana (kanji excluded: overlaps zh)

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const log = (...a) => console.log(...a);

// 1) force English locale
await page.goto(BASE);
await page.evaluate(() => localStorage.setItem('sckool.locale', 'en'));
await page.reload();
await page.waitForTimeout(500);

// report nav labels (UI chrome must be non-Japanese)
const navLabels = await page.$$eval('nav button', (bs) => bs.map((b) => b.textContent.trim()));
log('NAV LABELS:', JSON.stringify(navLabels));
log(
  'NAV has hiragana/katakana:',
  navLabels.some((l) => JP.test(l)),
);

// 2) sign up
const org = 'AUDIT ' + Math.random().toString(36).slice(2, 7).toUpperCase();
await page
  .getByRole('button', { name: /sign ?up/i })
  .first()
  .click();
await page.waitForTimeout(300);
await page.fill('#organization-name', org);
await page.fill('#password', 'auditpass123');
// submit create
await page.locator('form button[type=submit]').click();
await page.waitForTimeout(1500);
const bodyAfterCreate = await page.textContent('body');
const marketIdMatch = bodyAfterCreate.match(/MKT-[A-Z0-9]{4}-[A-Z0-9]{4}/);
const recoveryMatch = bodyAfterCreate.match(/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/g);
log('MARKET ID shown:', marketIdMatch && marketIdMatch[0]);
log('RECOVERY-ish codes shown:', recoveryMatch);
// click "saved" to log in
await page
  .locator('button', { hasText: /saved|i.?ve saved|done|continue/i })
  .first()
  .click()
  .catch(async () => {
    // fallback: last button in the card
    await page.locator('div button').last().click();
  });
await page.waitForTimeout(1500);
const loggedInText = await page.textContent('body');
log('LOGGED IN (org appears in header):', loggedInText.includes(org));

// 3) register a product (nav -> my listings / sell)
await page.locator('nav button').nth(1).click(); // second nav item = myListings/sell
await page.waitForTimeout(500);
const today = new Date().toISOString().slice(0, 10);
const end = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
await page.fill('#title', 'Audit Service ' + org);
await page.fill('#description', 'A test product created by the audit script.');
await page.fill('#target_customer', 'Other companies');
await page.fill('#problem_solved', 'Needs verification');
await page.fill('#price', '1200');
await page.fill('#available_quantity', '10');
await page.fill('#image_url', 'https://example.com/x.png');
await page.fill('#sale_starts_at', today);
await page.fill('#sale_ends_at', end);
await page.locator('form button[type=submit]').click();
await page.waitForTimeout(1500);
const afterListing = await page.textContent('body');
log(
  'LISTING created (done marker or appears in my listings):',
  afterListing.includes('Audit Service ' + org),
);

// 4) buy another company's product from the market
await page.locator('nav button').nth(0).click(); // market
await page.waitForTimeout(800);
// open first listing card that is NOT mine
const cards = await page
  .locator('main a, main button, main [role=button], main li, main article')
  .all();
// simpler: click first product open control
let opened = false;
const openButtons = await page.locator('main button, main a').all();
for (const b of openButtons) {
  const txt = (await b.textContent()) || '';
  if (txt.includes(org)) continue; // skip my own
  // heuristic: product cards have a price with MP
  if (/\d/.test(txt) || txt.length > 3) {
    await b.click();
    await page.waitForTimeout(700);
    const dt = await page.textContent('body');
    if (/buy|purchase/i.test(dt) || dt.length > 0) {
      opened = true;
      break;
    }
  }
}
log('opened a listing detail:', opened);
await page.waitForTimeout(500);
// find buy button
const buyBtn = page.locator('button', { hasText: /buy|purchase/i }).first();
let boughtOk = false;
let buyMsg = '';
if (await buyBtn.count()) {
  const before = await page.textContent('body');
  await buyBtn.click();
  await page.waitForTimeout(1500);
  buyMsg = (await page.textContent('body')).slice(0, 0);
  const after = await page.textContent('body');
  boughtOk = /done|success|purchased|thank|completed|bought/i.test(after) || after !== before;
}
log('buy button present:', (await buyBtn.count()) > 0, '| buy attempted result changed:', boughtOk);

// 5) dashboard
await page.locator('nav button').nth(2).click(); // dashboard
await page.waitForTimeout(1200);
const dashText = await page.textContent('body');
log(
  'DASHBOARD shows Revenue/Balance labels:',
  /revenue/i.test(dashText),
  /balance/i.test(dashText),
);
// count chart bars
const bars = await page.locator('div[title]').count();
log('DASHBOARD chart elements with title (bars):', bars);
// is it an svg line/polyline? (line chart check)
const svgLines = await page.locator('svg polyline, svg path').count();
log('DASHBOARD svg polyline/path elements (line-chart):', svgLines);

// UI-chrome Japanese scan on dashboard headings/labels
const headings = await page.$$eval('h1,h2,h3,label,nav button', (els) =>
  els.map((e) => e.textContent.trim()).filter(Boolean),
);
const jpHeadings = headings.filter((h) => /[぀-ゟ゠-ヿ]/.test(h));
log('UI headings/labels with hiragana/katakana:', JSON.stringify(jpHeadings));

// 6) 375px horizontal scroll on 4 main screens
async function scrollCheck(name, navIndex) {
  await page.setViewportSize({ width: 375, height: 720 });
  await page.locator('nav button').nth(navIndex).click();
  await page.waitForTimeout(700);
  const res = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }));
  log(`375px [${name}] scrollWidth=${res.sw} innerWidth=${res.iw} overflow=${res.sw > res.iw}`);
  return res.sw > res.iw;
}
// market(0), listing detail: open one, dashboard(2), my listings/form(1)
await scrollCheck('market', 0);
// listing detail at 375
await page.locator('nav button').nth(0).click();
await page.waitForTimeout(500);
const ob = await page.locator('main button, main a').all();
for (const b of ob) {
  const txt = (await b.textContent()) || '';
  if (txt.includes(org)) continue;
  if (txt.length > 3) {
    await b.click();
    break;
  }
}
await page.waitForTimeout(700);
{
  const res = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }));
  log(
    `375px [listing-detail] scrollWidth=${res.sw} innerWidth=${res.iw} overflow=${res.sw > res.iw}`,
  );
}
await scrollCheck('listing-form/sell', 1);
await scrollCheck('dashboard', 2);

await browser.close();
log('DONE');
