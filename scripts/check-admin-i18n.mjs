#!/usr/bin/env node
/**
 * 先生が見る画面（管理画面）が6言語で使えるかを、実際のブラウザで確かめる
 * （受け入れ基準 H1〜H4・I1・I2、要件26・34）。
 *
 * 見るのは3つ。
 *   1. 3つのページの表の見出しが、言語を切り替えると訳される
 *   2. 相互取引率の説明文も訳される（数字だけでなく、読み方の断り書きも）
 *   3. 6言語すべてで、仕組みが出す文字にかな（日本語）が混ざらない
 *
 * 使い方（バックエンドと管理画面の両方を起動しておく）:
 *   pnpm run api:dev
 *   pnpm --filter @sckool/admin dev
 *   node scripts/check-admin-i18n.mjs
 *
 * 別の場所で動かしているときは環境変数で渡す:
 *   ADMIN_URL=http://localhost:7100/dashboard node scripts/check-admin-i18n.mjs
 *
 * 企業名や先生の識別子は入れたデータなので、この検査の対象にしない（受け入れ基準 I3）。
 */

import { chromium } from '@playwright/test';

const BASE = (process.env.ADMIN_URL ?? 'http://localhost:7000/dashboard').replace(/\/$/, '');
const EMAIL = process.env.ADMIN_EMAIL ?? 'probe-admin@anon.invalid';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'probe-password-1234';

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

console.log('\n=== 管理者としてログインする ===');
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 30000 });
console.log('  入れた');

const setLocale = async (code) => {
  await page.selectOption('select[aria-label="Language"]', code);
  await page.waitForTimeout(300);
};

/**
 * 表の見出しと説明文。企業名などの入れたデータは見ない。
 *
 * 見るのは**自分たちのページの中だけ**。周りの Mercur の画面（左のメニューなど）は
 * こちらの辞書では訳せない。左のメニューの文言は管理画面の起動時に決まるので、
 * 言語を変えたあと開き直すまで前の言語のままになる。
 */
const chromeText = async () =>
  (
    await page.locator('[data-testid="sckool-admin-page"]').locator('h1, h2, p, th').allInnerTexts()
  ).join(' | ');

const japanese = /[぀-ゟ゠-ヿ]/; // ひらがな・カタカナ

const PAGES = [
  {
    path: '/organizations',
    // タイ語にしたときに、その画面にしか出ない見出しが訳されていること。
    thai: ['ยอดคงเหลือ', 'อัตรากำไร', 'ค่าโฆษณา'],
  },
  {
    path: '/trade-analysis',
    thai: [
      'อัตราการซื้อขายระหว่างกัน',
      // 「不正の判定ではありません」の断り書き。ここが訳されないと画面の意味が変わる。
      'นี่ไม่ใช่การตัดสินว่าโกง',
      // 相互取引率の説明文。
      'คู่ที่เกิน',
    ],
  },
  {
    path: '/purchase-log',
    thai: ['จำนวนครั้งที่ซื้อ', 'ครูคนอื่นก็มองเห็นได้'],
  },
  {
    path: '/password-reset',
    // 見出しと、「教室で本人を確かめてから」という断り書き。
    thai: ['ตั้งรหัสผ่านใหม่', 'กรุณายืนยันตัวบุคคลในห้องเรียนก่อน'],
  },
  {
    path: '/market-settings',
    // 見出し・説明・テストの換算表の見出し。
    thai: ['การตั้งค่า', 'ปรับตัวเลขให้เข้ากับคาบเรียนได้', 'ตารางโบนัสของแบบทดสอบ'],
  },
];

for (const target of PAGES) {
  console.log(`\n=== ${target.path} ===`);
  await page.goto(`${BASE}${target.path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('select[aria-label="Language"]', { timeout: 15000 });

  await setLocale('th-TH');
  const thai = await chromeText();
  for (const word of target.thai) {
    expect(`タイ語で「${word}」が出る`, thai.includes(word), true);
  }
  expect('タイ語のときに かな が混ざらない', japanese.test(thai), false);

  for (const code of ['en', 'zh-CN', 'vi-VN', 'ne-NP']) {
    await setLocale(code);
    expect(`${code}: 画面の文字にかなが無い`, japanese.test(await chromeText()), false);
  }

  // 日本語に戻すと元の文言になる（切替が片道でないこと）。
  await setLocale('ja-JP');
  expect('日本語に戻せる', japanese.test(await chromeText()), true);
}

await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length}件が通りませんでした:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('\nすべて通りました。');
