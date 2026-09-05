#!/usr/bin/env node
/**
 * 商品名と説明の翻訳が受け入れ基準どおりかを、動いているサーバーで確かめる
 * （受け入れ基準 I3、要件34）。
 *
 * 見るのは3つ。
 *   1. 訳を入れた言語では、その訳が出るか
 *   2. 訳を入れていない言語では、原文が出るか
 *   3. 訳を入れなくても商品を登録できるか
 *
 * 使い方: サーバーを起動しておいて `node scripts/check-translations.mjs`
 */

import { Client } from 'pg';

const BASE = process.env.API_BASE_URL ?? 'http://localhost:9000';
const connectionString =
  process.env.DATABASE_URL ?? 'postgres://medusa:medusa@localhost:5432/sckool';

const client = new Client({ connectionString });
await client.connect();
const { rows } = await client.query(
  `SELECT token FROM api_key WHERE type = 'publishable' AND revoked_at IS NULL
   ORDER BY created_at DESC LIMIT 1`,
);
await client.end();

const publishableKey = rows[0]?.token;
if (!publishableKey) {
  console.error('公開鍵がありません。先に seed-market を実行してください。');
  process.exit(1);
}

const failures = [];
function expect(label, actual, wanted) {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  console.log(`  ${ok ? '通った' : '通らない'}: ${label}（${JSON.stringify(actual)}）`);
  if (!ok) failures.push(`${label}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(wanted)}`);
}

let currentToken;
async function request(method, path, body, token = currentToken) {
  const headers = { 'content-type': 'application/json', 'x-publishable-api-key': publishableKey };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(new URL(path, BASE), {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

async function login(marketId, password = 'good-password-1234') {
  const result = await request(
    'POST',
    '/auth/customer/emailpass',
    { email: marketId, password },
    null,
  );
  return result.body?.token;
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

console.log('\n=== 準備: 企業を1つ作る ===');
const account = await request('POST', '/store/accounts', {
  password: 'good-password-1234',
  organization_name: `TRANSLATION ${stamp}`,
});
expect('作れた', account.status, 201);
currentToken = await login(account.body?.market_id);
expect('合鍵を受け取った', typeof currentToken, 'string');

const base = {
  description: '日本語の説明',
  target_customer: 'ターゲット',
  problem_solved: '課題',
  price: 1_000,
  available_quantity: 5,
  image_url: 'https://example.com/a.png',
  sale_starts_at: '2026-01-01T00:00:00Z',
  sale_ends_at: '2099-12-31T00:00:00Z',
};

console.log('\n=== 訳を入れて出品できる（受け入れ基準 I3）===');
const withTranslation = await request('POST', '/store/listings', {
  ...base,
  title: `翻訳あり ${stamp}`,
  translations: [
    { locale_code: 'en', title: 'Translated title', description: 'Translated description' },
    // 商品名だけ訳して説明は空にする。片方だけでも受け付けるか見る。
    { locale_code: 'zh-CN', title: '只有标题', description: '' },
  ],
});
expect('出品できた', withTranslation.status, 201);
const translatedId = withTranslation.body?.listing?.id;

console.log('\n=== 訳を入れなくても出品できる（同 I3）===');
const withoutTranslation = await request('POST', '/store/listings', {
  ...base,
  title: `翻訳なし ${stamp}`,
});
expect('訳が無くても出品できた', withoutTranslation.status, 201);
const plainId = withoutTranslation.body?.listing?.id;

expect(
  '訳の欄そのものを送らなくても出品できた',
  (await request('POST', '/store/listings', { ...base, title: `欄なし ${stamp}` })).status,
  201,
);

console.log('\n=== 英語表示では訳が出る（同 I3）===');
const inEnglish = await request('GET', `/store/listings/${translatedId}?locale=en`);
expect('商品名が訳になる', inEnglish.body?.listing?.title, 'Translated title');
expect('説明も訳になる', inEnglish.body?.listing?.description, 'Translated description');
expect('どの言語の訳かが分かる', inEnglish.body?.listing?.translated_from, 'en');

console.log('\n=== 訳を入れていないタイ語表示では原文が出る（同 I3）===');
const inThai = await request('GET', `/store/listings/${translatedId}?locale=th-TH`);
expect('商品名は原文', inThai.body?.listing?.title, `翻訳あり ${stamp}`);
expect('説明も原文', inThai.body?.listing?.description, '日本語の説明');
expect('訳の印は付かない', inThai.body?.listing?.translated_from, undefined);

console.log('\n=== 片方だけ訳したときは、空の側が原文になる ===');
const inChinese = await request('GET', `/store/listings/${translatedId}?locale=zh-CN`);
expect('商品名は訳', inChinese.body?.listing?.title, '只有标题');
expect('説明は原文のまま', inChinese.body?.listing?.description, '日本語の説明');

console.log('\n=== 言語を指定しなければ原文が出る ===');
const noLocale = await request('GET', `/store/listings/${translatedId}`);
expect('原文が出る', noLocale.body?.listing?.title, `翻訳あり ${stamp}`);

console.log('\n=== 訳の無い商品は、どの言語でも原文が出る ===');
for (const locale of ['en', 'zh-CN', 'th-TH', 'ne-NP', 'vi-VN']) {
  const result = await request('GET', `/store/listings/${plainId}?locale=${locale}`);
  expect(`${locale} でも原文`, result.body?.listing?.title, `翻訳なし ${stamp}`);
}

console.log('\n=== 市場一覧でも訳が出る ===');
const market = await request('GET', '/store/listings?locale=en');
const fromMarket = (market.body?.listings ?? []).find((listing) => listing.id === translatedId);
expect('一覧でも訳になる', fromMarket?.title, 'Translated title');
const plainFromMarket = (market.body?.listings ?? []).find((listing) => listing.id === plainId);
expect('訳の無い商品は原文のまま', plainFromMarket?.title, `翻訳なし ${stamp}`);

console.log('\n=== 知らない言語の訳は保存しない ===');
const unknownLocale = await request('POST', '/store/listings', {
  ...base,
  title: `未知の言語 ${stamp}`,
  translations: [{ locale_code: 'xx-XX', title: 'nope', description: 'nope' }],
});
expect('出品自体はできる', unknownLocale.status, 201);
expect(
  '知らない言語では原文が出る',
  (await request('GET', `/store/listings/${unknownLocale.body?.listing?.id}?locale=en`)).body
    ?.listing?.title,
  `未知の言語 ${stamp}`,
);

console.log('\n=== まとめ ===');
if (failures.length > 0) {
  console.error(`${failures.length}件が通りませんでした:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('全て通りました。');
