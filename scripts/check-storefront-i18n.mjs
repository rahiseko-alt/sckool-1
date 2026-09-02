#!/usr/bin/env node
/**
 * 生徒が見る画面が6言語で使えるかを、実際のブラウザで確かめる
 * （受け入れ基準 I1・I2・J3、要件34）。
 *
 * 見るのは4つ。
 *   1. 6言語すべてで、仕組みが出す文字にかな（日本語）が混ざらないか
 *   2. 企業をつくって商品を買うまで、日本語以外の1言語だけで進めるか
 *   3. 画面を開いたまま言語を変えても、その場で切り替わるか
 *   4. 幅375pxで横スクロールが出ないか
 *
 * 使い方（バックエンドと生徒の画面の両方を起動しておく）:
 *   pnpm run api:dev
 *   VITE_PUBLISHABLE_KEY=<公開鍵> pnpm run storefront:dev
 *   node scripts/check-storefront-i18n.mjs
 *
 * 商品名は生徒が入れたデータなので、この検査の対象にしない（受け入れ基準 I3、T036）。
 */

import { chromium } from '@playwright/test';

const BASE = 'http://localhost:8000/';
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);

const failures = [];
function expect(label, actual, wanted) {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  console.log(`  ${ok ? '通った' : '通らない'}: ${label}（${JSON.stringify(actual)}）`);
  if (!ok) failures.push(label);
}

const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('  [error]', e.message));

const setLocale = async (code) => {
  await page.selectOption('select[aria-label="Language"]', code);
  await page.waitForTimeout(400);
};

console.log('\n=== 6言語すべてで市場一覧に日本語が混ざらない（受け入れ基準 I2）===');
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// 画面の「仕組みが出す文字」だけを見る。商品名は生徒が入れたデータなので対象外（I3 で扱う）。
const chromeText = async () => {
  const parts = await page
    .locator('nav button, header button, main > h1, main > p')
    .allInnerTexts();
  return parts.join(' | ');
};

const japanese = /[぀-ゟ゠-ヿ]/; // ひらがな・カタカナ
for (const code of ['en', 'zh-CN', 'vi-VN', 'ne-NP', 'th-TH']) {
  await setLocale(code);
  const text = await chromeText();
  expect(`${code}: 画面の文字にかなが無い`, japanese.test(text), false);
}
await setLocale('ja-JP');
expect('日本語に戻せる', japanese.test(await chromeText()), true);

console.log('\n=== 企業をつくって購入まで進める（英語で）===');
await setLocale('en');
await page.getByRole('button', { name: 'Sign up' }).click();
await page.waitForTimeout(300);
const name = `EN BUYER ${Date.now()}`;
await page.fill('#organization-name', name);
await page.fill('#password', 'good-password-1234');
await page.getByRole('button', { name: 'Create company' }).click();
await page.waitForTimeout(1500);
const shown = await page.locator('h1').innerText();
expect('控える画面が英語で出る', shown, 'Write these two down');
await page.getByRole('button', { name: 'Saved them, go to the market' }).click();
await page.waitForTimeout(1500);
expect('ログイン中の表示が出る', (await page.locator('nav').innerText()).includes(name), true);

console.log('\n=== 購入のエラーが切り替えた言語で出る（受け入れ基準 I2）===');
// 自分の残高より高い商品を探す代わりに、自社商品ではない商品を開いて購入する。
await page.getByRole('button', { name: 'View details' }).first().click();
await page.waitForTimeout(1200);
expect('詳細が開いた', (await page.locator('h1').count()) > 0, true);

// タイ語に切り替えても、開いている画面の文字が変わる。
await setLocale('th-TH');
await page.waitForTimeout(400);
const thaiText = await page.locator('main').innerText();
expect('タイ語に切り替わる', /[฀-๿]/.test(thaiText), true);

await setLocale('en');
const buy = page.getByRole('button', { name: 'Buy' });
if ((await buy.count()) > 0) {
  await buy.first().click();
  await page.waitForTimeout(1500);
  const after = await page.locator('main').innerText();
  const bought = after.includes('Purchase complete');
  const refused = after.includes('cannot buy') || after.includes('enough MP');
  expect('購入できたか、理由が英語で出る', bought || refused, true);
  await page.screenshot({ path: 'tmp/store/purchase-en.png' });
}

console.log('\n=== ランキングとテストも訳されている ===');
await page.getByRole('button', { name: 'Ranking' }).first().click();
await page.waitForTimeout(1200);
expect('ランキングが英語', await page.locator('main h1').innerText(), 'Ranking');
await page.screenshot({ path: 'tmp/store/ranking-en.png' });

await setLocale('ne-NP');
await page.waitForTimeout(500);
expect('ネパール語に切り替わる', /[ऀ-ॿ]/.test(await page.locator('main').innerText()), true);
await page.screenshot({ path: 'tmp/store/ranking-ne.png' });

await setLocale('en');
await page.getByRole('button', { name: 'Quizzes' }).first().click();
await page.waitForTimeout(1200);
expect('テストが英語', await page.locator('main h1').innerText(), 'Quizzes');
await page.screenshot({ path: 'tmp/store/quizzes-en.png' });

console.log('\n=== 企業側の画面がネパール語で訳されている（受け入れ基準 I2、T034）===');
await setLocale('ne-NP');
await page
  .getByRole('button', { name: /मेरा सामानहरू/ })
  .first()
  .click();
await page.waitForTimeout(1200);

// 項目名がすべて訳されているか。かなが1文字でもあれば訳し漏れ。
const formText = await page.locator('main form').innerText();
expect('商品登録の項目名にかなが無い', japanese.test(formText), false);
expect('デーバナーガリーで書かれている', /[ऀ-ॿ]/.test(formText), true);

console.log('\n--- 必須項目を空にしたときのエラーも訳されている ---');
// 1つだけ埋めて出す。残りの項目に「入力してください」が出るはず。
await page.fill('#title', 'テスト');
await page
  .getByRole('button', { name: /राख्नुहोस्/ })
  .first()
  .click();
await page.waitForTimeout(1500);
const afterSubmit = await page.locator('main form').innerText();
expect('項目ごとのエラーが出た', afterSubmit.includes('यो भर्नुहोस्'), true);
expect('エラーにかなが無い', japanese.test(afterSubmit.replace('テスト', '')), false);
await page.screenshot({ path: 'tmp/store/listing-form-ne.png' });

console.log('\n--- 経営・広告も訳されている ---');
for (const [label, name] of [
  ['経営', /व्यवसाय/],
  ['広告', /विज्ञापन/],
]) {
  await page.getByRole('button', { name }).first().click();
  await page.waitForTimeout(1500);
  const text = await page.locator('main').innerText();
  expect(`${label}: かなが無い`, japanese.test(text), false);
}
await page.screenshot({ path: 'tmp/store/ads-ne.png' });

console.log('\n--- 取引履歴も訳されている ---');
// 商品名は生徒が入れたデータなので日本語のことがある（受け入れ基準 I3、T036）。
// 見るのは見出しと、取引の種類の言葉だけ。
await page
  .getByRole('button', { name: /कारोबारको सूची/ })
  .first()
  .click();
await page.waitForTimeout(1500);
expect(
  '取引履歴: 見出しにかなが無い',
  japanese.test((await page.locator('main h1, main thead').allInnerTexts()).join(' ')),
  false,
);
expect(
  '取引履歴: 取引の種類が訳されている',
  (await page.locator('main tbody').innerText()).includes('सुरुको पुँजी'),
  true,
);
await page.screenshot({ path: 'tmp/store/transactions-ne.png' });

await setLocale('en');

console.log('\n=== ルール説明とはじめかたが6言語で読める（受け入れ基準 I2、T038）===');
// カルテル・循環取引・贔屓の3つが載っていること。載っていないと、何が禁止か伝わらない。
const RULE_MARKS = {
  'ja-JP': ['カルテル', '循環取引', '仲の良さ'],
  en: ['cartels', 'move money around', 'friends'],
  'zh-CN': ['卡特尔', '循环交易', '关系好'],
  'vi-VN': ['thỏa thuận giá', 'chuyển tiền vòng quanh', 'bạn bè'],
  'ne-NP': ['कार्टेल', 'पैसा घुमाउन', 'साथी'],
  'th-TH': ['ฮั้วราคา', 'หมุนเงิน', 'สนิทกัน'],
};

for (const [code, marks] of Object.entries(RULE_MARKS)) {
  await setLocale(code);
  await page
    .getByRole('button', { name: /ルール|Rules|规则|Quy tắc|नियम|กฎ/ })
    .first()
    .click();
  await page.waitForTimeout(900);
  const text = await page.locator('main').innerText();
  for (const mark of marks) {
    expect(`${code}: ${mark} の説明がある`, text.includes(mark), true);
  }
}
await page.screenshot({ path: 'tmp/store/rules-th.png' });
await setLocale('en');

console.log('\n=== 幅375pxで横スクロールが出ない（受け入れ基準 J3）===');
const narrow = await browser.newContext({ viewport: { width: 375, height: 800 } });
const small = await narrow.newPage();
await small.goto(BASE, { waitUntil: 'networkidle' });
await small.waitForTimeout(1500);
expect(
  '市場一覧',
  await small.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  ),
  false,
);
await small
  .getByRole('button')
  .filter({ hasText: /ランキング|Ranking/ })
  .first()
  .click();
await small.waitForTimeout(1200);
expect(
  'ランキング',
  await small.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  ),
  false,
);
await small.screenshot({ path: 'tmp/store/narrow-ranking.png' });

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length} 件が通りませんでした`);
  await browser.close();
  process.exit(1);
}
console.log('すべて通りました。');
await browser.close();
