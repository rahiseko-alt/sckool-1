#!/usr/bin/env node
/**
 * 主要な流れを、実際のブラウザで最初から最後まで通す（受け入れ基準 A1・B2・C1・D1〜D5・G1）。
 *
 * なぞるのは生徒が実際にする4つ。
 *   1. アカウントをつくる（2社ぶん。1社が出品し、もう1社が買う）
 *   2. 商品を出す
 *   3. 他社の商品を買う
 *   4. 経営の画面で、売れた側の売上と買った側の残高が変わったことを確かめる
 *
 * **API を直接叩かない。** ボタンを押し、欄を埋め、画面に出た文字を読む。
 * API だけを叩く検査は既に `scripts/check-purchases.mjs` などが持っている。
 * ここが見るのは「人が同じ手順でやって、同じ結果になるか」。画面と API の
 * つなぎ目が切れていても API の検査は通ってしまうので、その層をここで埋める。
 *
 * 使い方（バックエンドと生徒の画面の両方を起動しておく）:
 *   node scripts/with-api.mjs node scripts/with-storefront.mjs node scripts/check-e2e.mjs
 *
 * 2社は**別々のブラウザ**で操作する。ログインの記録はブラウザに残るので、
 * 1つのブラウザで往復すると片方のログインがもう片方を上書きする。
 */

import { mkdirSync } from 'node:fs';

import { chromium } from '@playwright/test';

const BASE = process.env.STOREFRONT_URL ?? 'http://localhost:8000/';
/** アカウントを作ったときに配られる額（`apps/api/src/api/store/accounts/route.ts`）。 */
const INITIAL_FUNDS = 100_000;
const PRICE = 3_400;
const QUANTITY = 3;
const PASSWORD = 'good-password-1234';

mkdirSync('tmp/e2e', { recursive: true });

const failures = [];
function expect(label, actual, wanted) {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  console.log(`  ${ok ? '通った' : '通らない'}: ${label}（${JSON.stringify(actual)}）`);
  if (!ok) failures.push(`${label}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(wanted)}`);
}

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);

/** 「100,000 MP」のような表示から数だけを取り出す。 */
const digits = (text) => Number(String(text).replace(/[^\d-]/g, ''));

/** 日付の欄に入れる形（YYYY-MM-DD）。 */
const dayOffset = (days) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** 1社ぶんのブラウザ。英語で操作する（どの言語でも同じ手順で通ることは T033 が見ている）。 */
async function openBrowserFor() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log('  [画面のエラー]', error.message));
  /**
   * `networkidle` は使わない。商品の画像は実在しない URL なので読み込みが失敗し続け、
   * 「通信が静かになった」状態にならないことがある。描画されたら次へ進む。
   */
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('select[aria-label="Language"]').waitFor({ timeout: 20_000 });
  await page.selectOption('select[aria-label="Language"]', 'en');
  await page.waitForTimeout(300);
  return page;
}

/**
 * 企業をつくる。**画面に出た ID を読み取って返す。**
 * この ID は控える画面でしか出ないので、あとでログインし直すために持っておく。
 */
async function signUp(page, name) {
  await page.getByRole('button', { name: 'Sign up' }).first().click();
  await page.fill('#organization-name', name);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Create company' }).click();
  await page.getByRole('heading', { name: 'Write these two down' }).waitFor({ timeout: 20_000 });

  // 控える画面は ID と再発行コードを .numeric で並べて出す。先が ID。
  const marketId = (await page.locator('.numeric').first().innerText()).trim();

  await page.getByRole('button', { name: 'Saved them, go to the market' }).click();
  await page.getByText(`Logged in as: ${name}`).waitFor({ timeout: 20_000 });
  return marketId;
}

/** ダッシュボードの数字を1つ読む。見出しの次の欄に値が出る。 */
async function figure(page, label) {
  const value = await page
    .getByText(label, { exact: true })
    .first()
    .locator('xpath=following-sibling::div[1]')
    .innerText();
  return digits(value);
}

/** 経営の画面を開き直す（数字は開いたときに読み込まれる）。 */
async function openDashboard(page) {
  await page.getByRole('button', { name: 'Market', exact: true }).first().click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Business', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Business' }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
}

/** 市場に並んだ商品の枠。同じ名前の商品は作らないので1つに定まる。 */
const cardOf = (page, title) => page.locator('article').filter({ hasText: title });

const stamp = Date.now();
const sellerName = `SELLER ${stamp}`;
const buyerName = `BUYER ${stamp}`;
const productTitle = `E2E Desk Lamp ${stamp}`;

console.log('\n=== 1. 企業をつくる（受け入れ基準 A1・B2）===');

const seller = await openBrowserFor();
const sellerId = await signUp(seller, sellerName);
expect('売る企業の ID が発行された', /^MKT-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(sellerId), true);
expect(
  '売る企業がログインした状態になった',
  (await seller.locator('nav').innerText()).includes(sellerName),
  true,
);

await openDashboard(seller);
expect('出品する前の残高は初期資金だけ', await figure(seller, 'Balance'), INITIAL_FUNDS);
expect('出品する前の売上は0', await figure(seller, 'Revenue'), 0);

const buyer = await openBrowserFor();
const buyerId = await signUp(buyer, buyerName);
expect('買う企業の ID が発行された', /^MKT-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(buyerId), true);
expect(
  '買う企業がログインした状態になった',
  (await buyer.locator('nav').innerText()).includes(buyerName),
  true,
);

console.log('\n=== 2. 商品を出す（受け入れ基準 C1）===');

await seller.getByRole('button', { name: 'My products' }).first().click();
await seller.getByRole('heading', { name: 'List a product' }).waitFor({ timeout: 20_000 });

await seller.fill('#title', productTitle);
await seller.fill('#description', 'A desk lamp that keeps a small office bright at night.');
await seller.fill('#target_customer', 'Companies that work late');
await seller.fill('#problem_solved', 'The office gets too dark to work');
await seller.fill('#price', String(PRICE));
await seller.fill('#available_quantity', String(QUANTITY));
await seller.fill('#image_url', 'https://example.invalid/lamp.png');
await seller.fill('#sale_starts_at', dayOffset(-1));
await seller.fill('#sale_ends_at', dayOffset(30));
await seller.getByRole('button', { name: 'List it' }).click();
await seller.waitForTimeout(1_500);

const afterList = await seller.locator('main').innerText();
expect('商品を出せた', afterList.includes('Your product is listed'), true);
expect('自社の商品一覧に並んだ', afterList.includes(productTitle), true);
await seller.screenshot({ path: 'tmp/e2e/1-listed.png' });

console.log('\n=== 2-b. 自社の商品は買えない（受け入れ基準 D2）===');

/**
 * **押してから断るのでは基準を満たさない。** 基準は「購入ボタンが押せない」。
 * API は自社購入を 400 で拒んでいたが、画面のボタンは押せたままだった
 * （判定役が発見）。売った側の画面で、ボタンが無いことを見る。
 */
await seller.reload({ waitUntil: 'domcontentloaded' });
await cardOf(seller, productTitle).waitFor({ timeout: 30_000 });
await cardOf(seller, productTitle).getByRole('button', { name: 'View details' }).click();
await seller.getByRole('heading', { name: productTitle }).waitFor({ timeout: 20_000 });
expect(
  '自社の商品には購入ボタンが無い',
  await seller.getByRole('button', { name: 'Buy', exact: true }).count(),
  0,
);
expect(
  '代わりに理由が出ている',
  (await seller.locator('main').innerText()).includes('This is your own product'),
  true,
);
await seller.screenshot({ path: 'tmp/e2e/2b-own-listing.png' });

console.log('\n=== 3. 他社の商品を買う（受け入れ基準 C2・D1〜D3）===');

await buyer.reload({ waitUntil: 'domcontentloaded' });
await cardOf(buyer, productTitle).waitFor({ timeout: 30_000 });
expect('市場にその商品が並んだ', await cardOf(buyer, productTitle).count(), 1);
expect(
  '出品者の名前が出ている',
  (await cardOf(buyer, productTitle).innerText()).includes(sellerName),
  true,
);

await cardOf(buyer, productTitle).getByRole('button', { name: 'View details' }).click();
await buyer.getByRole('heading', { name: productTitle }).waitFor({ timeout: 20_000 });
const detail = await buyer.locator('main').innerText();
expect('詳細に値段が出ている', detail.includes(PRICE.toLocaleString()), true);
expect('詳細に残りの数が出ている', detail.includes(`Remaining: ${QUANTITY}`), true);
await buyer.screenshot({ path: 'tmp/e2e/2-detail.png' });

await buyer.getByRole('button', { name: 'Buy', exact: true }).click();
await buyer.waitForTimeout(2_000);
const afterBuy = await buyer.locator('main').innerText();
expect('買えた', afterBuy.includes('Purchase complete'), true);
expect(
  '何を誰から買ったかが出た',
  afterBuy.includes(productTitle) && afterBuy.includes(sellerName),
  true,
);
expect(
  '購入直後の残高が代金ぶん減っている',
  digits(
    await buyer
      .getByText('Balance after this purchase', { exact: true })
      .locator('xpath=following-sibling::div[1]')
      .innerText(),
  ),
  INITIAL_FUNDS - PRICE,
);
await buyer.screenshot({ path: 'tmp/e2e/3-bought.png' });

await buyer.getByRole('button', { name: 'Back to the market' }).click();
await cardOf(buyer, productTitle).waitFor({ timeout: 30_000 });
expect(
  '市場の残りが1つ減った',
  (await cardOf(buyer, productTitle).innerText()).includes(`Remaining: ${QUANTITY - 1}`),
  true,
);

console.log('\n=== 4-a. 買った側の経営の画面（受け入れ基準 G1）===');

await openDashboard(buyer);
expect('買った側の残高が減っている', await figure(buyer, 'Balance'), INITIAL_FUNDS - PRICE);
expect('買った件数が1件', await figure(buyer, 'Items bought'), 1);
expect('支出が代金と同じ', await figure(buyer, 'Expenses'), PRICE);
expect('買った側に売上は立たない', await figure(buyer, 'Revenue'), 0);
await buyer.screenshot({ path: 'tmp/e2e/4-buyer-dashboard.png' });

await buyer.getByRole('button', { name: 'History' }).first().click();
await buyer.waitForTimeout(1_200);
const history = await buyer.locator('main tbody').innerText();
expect('取引履歴に購入が残った', history.includes('Bought a product'), true);
expect('取引履歴に相手の企業名が出る', history.includes(sellerName), true);

console.log('\n=== 4-b. 売った側の経営の画面（受け入れ基準 A2・G1）===');

// いったんログアウトして入り直す。控えた ID とパスワードで戻れることも、ここで確かめる。
await seller.getByRole('button', { name: 'Log out' }).click();
await seller.waitForTimeout(500);
await seller.getByRole('button', { name: 'Log in' }).first().click();
await seller.fill('#market-id', sellerId);
await seller.fill('#login-password', PASSWORD);
await seller.locator('form button[type="submit"]').click();
await seller.getByText(`Logged in as: ${sellerName}`).waitFor({ timeout: 20_000 });
expect('控えた ID とパスワードで入り直せた', true, true);

await openDashboard(seller);
expect('売った側の売上が代金と同じ', await figure(seller, 'Revenue'), PRICE);
expect('売れた件数が1件', await figure(seller, 'Items sold'), 1);
expect(
  '売った側の残高が代金ぶん増えている',
  await figure(seller, 'Balance'),
  INITIAL_FUNDS + PRICE,
);
expect('売った側の支出は0', await figure(seller, 'Expenses'), 0);

const bySellerProduct = await seller
  .getByRole('heading', { name: 'Revenue by product' })
  .locator('xpath=following-sibling::ul[1]')
  .innerText();
expect('商品ごとの売上にその商品が出た', bySellerProduct.includes(productTitle), true);
expect('その商品の売上が代金と同じ', digits(bySellerProduct.split(productTitle)[1]), PRICE);
await seller.screenshot({ path: 'tmp/e2e/5-seller-dashboard.png' });

console.log('\n=== 4-c. 売った側の履歴にも相手が出る（受け入れ基準 D5）===');

// 判定役が「売った側の相手欄が空のまま」と指摘した箇所。買う側だけでなく
// 売る側からも「誰が買ったか」が見えることを、画面で確かめる。
await seller.getByRole('button', { name: 'History' }).first().click();
await seller.waitForTimeout(1_200);
const sellerHistory = await seller.locator('main tbody').innerText();
expect('取引履歴に販売が残った', sellerHistory.includes('Sold a product'), true);
expect('売った側にも相手の企業名が出る', sellerHistory.includes(buyerName), true);
expect('相手の Market ID は出ていない', sellerHistory.includes(buyerId), false);

console.log('\n=== 5. 企業名を後から変えられる（受け入れ基準 B1）===');

// 打ち間違えたまま作った生徒が直せないと、その名前で1つの授業を過ごすことになる。
const renamed = `${sellerName} RENAMED`;
// 上の並びの見出しは「company settings」。company は用語辞書（terms.organization）
// から来るので、辞書を変えるとこの文字列も変わる。
await seller.getByRole('button', { name: 'company settings' }).first().click();
await seller.locator('#new-organization-name').waitFor({ timeout: 20_000 });
await seller.fill('#new-organization-name', renamed);
await seller.locator('#new-organization-name').press('Enter');
await seller.getByText(`Logged in as: ${renamed}`).waitFor({ timeout: 20_000 });
expect('新しい名前で名乗るようになった', true, true);
await seller.screenshot({ path: 'tmp/e2e/6-seller-account.png' });

// 買った側から見た相手の名前も、次に開いたときには新しい名前になる。
// 読み込み直しても入ったままなら、控えを見ずに続けられる（ログインは localStorage に残る）。
await buyer.reload();
await buyer.getByRole('button', { name: 'History' }).first().click();
await buyer.waitForTimeout(2_000);
const historyAfterRename = await buyer.locator('main tbody').innerText();
expect('相手の企業名が新しいものに変わった', historyAfterRename.includes(renamed), true);

console.log('');
console.log(`売った企業: ${sellerName} / ${sellerId}`);
console.log(`買った企業: ${buyerName} / ${buyerId}`);
console.log(`商品: ${productTitle}（${PRICE} MP）`);

await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} 件が通りませんでした`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('\nすべて通りました。');
