#!/usr/bin/env node
/**
 * 広告枠の購入と効果の記録が受け入れ基準どおりかを、動いているサーバーで確かめる
 * （受け入れ基準 F1・F2、要件12・13）。
 *
 * 使い方: サーバーを起動しておいて `node scripts/check-ads.mjs`
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

/**
 * ログイン後の合鍵。**企業として行う操作には必ず要る。**
 * 本文に market_id を書いても名乗ったことにならない（docs/decisions.md「37.」）。
 */
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

/** 生徒としてログインして合鍵をもらう。 */
async function login(marketId, password = 'good-password-1234') {
  const result = await request(
    'POST',
    '/auth/customer/emailpass',
    { email: marketId, password },
    null,
  );
  return result.body?.token;
}

async function createOrganization(label) {
  const account = await request('POST', '/store/accounts', {
    password: 'good-password-1234',
    organization_name: `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const marketId = account.body?.market_id;
  return { marketId, name: account.body?.organization_name, token: await login(marketId) };
}

console.log('\n=== 準備: 企業と商品を作る ===');
const advertiser = await createOrganization('AD SELLER');
const listing = await request(
  'POST',
  '/store/listings',
  {
    title: `広告する商品 ${Date.now()}`,
    description: '説明',
    target_customer: 'ターゲット',
    problem_solved: '課題',
    price: 3_000,
    available_quantity: 5,
    image_url: 'https://example.com/a.png',
    sale_starts_at: '2026-01-01T00:00:00Z',
    sale_ends_at: '2099-12-31T00:00:00Z',
  },
  advertiser.token,
);
expect('商品ができた', listing.status, 201);
const listingId = listing.body?.listing?.id;

console.log('\n=== 他社の商品は宣伝できない ===');
const other = await createOrganization('AD OTHER');
expect(
  '断られた',
  (await request('POST', '/store/ads', { listing_id: listingId, days: 7 }, other.token)).status,
  403,
);

console.log('\n=== 日数がおかしいと断る（受け入れ基準 F1）===');
for (const [label, days] of [
  ['0日', 0],
  ['小数', 1.5],
  ['負の数', -3],
]) {
  expect(
    `${label}は断られた`,
    (await request('POST', '/store/ads', { listing_id: listingId, days }, advertiser.token)).status,
    400,
  );
}

console.log('\n=== MP を払って枠を買える（同 F1）===');
const bought = await request(
  'POST',
  '/store/ads',
  { listing_id: listingId, days: 7 },
  advertiser.token,
);
expect('買えた', bought.status, 201);
expect('7日分で3,500MP', bought.body?.spend, 3_500);
expect('残高から引かれた', bought.body?.balance?.total, 100_000 - 3_500);
const placementId = bought.body?.placement?.id;

console.log('\n=== 支払いが履歴に残る ===');
const history = await request('GET', '/store/transactions', undefined, advertiser.token);
const adSpend = (history.body?.transactions ?? []).find((row) => row.kind === 'ad_spend');
expect('広告費の行がある', Boolean(adSpend), true);
expect('金額が合う', adSpend?.amount, -3_500);

console.log('\n=== トップページの Featured 枠に出る（同 F1）===');
const featured = await request('GET', '/store/ads');
expect('取れた', featured.status, 200);
const shown = (featured.body?.featured ?? []).find((item) => item.listing_id === listingId);
expect('自分の商品が出ている', Boolean(shown), true);
expect('企業名だけが出る', shown?.organization_name, advertiser.name);
expect(
  'Market ID は出ていない',
  JSON.stringify(featured.body).includes(advertiser.marketId),
  false,
);

console.log('\n=== 表示した回数が数えられる（同 F2、要件13）===');
await request('GET', '/store/ads');
await request('GET', '/store/ads');
const afterViews = await request(
  'GET',
  `/store/ads/${placementId}/metrics`,
  undefined,
  advertiser.token,
);
expect('表示が3回以上', afterViews.body?.metrics?.impressions >= 3, true);

console.log('\n=== 押した回数が数えられる（同 F2）===');
expect('記録できた', (await request('POST', `/store/ads/${placementId}/click`)).status, 204);
const afterClick = await request(
  'GET',
  `/store/ads/${placementId}/metrics`,
  undefined,
  advertiser.token,
);
expect('クリックが1回', afterClick.body?.metrics?.clicks, 1);
expect('CTR が出る', typeof afterClick.body?.metrics?.ctr, 'number');

console.log('\n=== 広告経由の購入と ROAS（同 F2）===');
const buyer = await createOrganization('AD BUYER');
const purchase = await request('POST', '/store/purchases', { listing_id: listingId }, buyer.token);
expect('買えた', purchase.status, 201);
const afterBuy = await request(
  'GET',
  `/store/ads/${placementId}/metrics`,
  undefined,
  advertiser.token,
);
expect('広告経由の購入が1件', afterBuy.body?.metrics?.conversions, 1);
expect('売上が入る', afterBuy.body?.metrics?.revenue, 3_000);
// 3,000 ÷ 3,500 = 0.857... を小数第2位で丸める
expect('ROAS が出る', afterBuy.body?.metrics?.roas, 0.86);

console.log('\n=== 残高より高い枠は買えない ===');
const poor = await createOrganization('AD POOR');
const poorListing = await request(
  'POST',
  '/store/listings',
  {
    title: `商品 ${Date.now()}`,
    description: '説明',
    target_customer: 'ターゲット',
    problem_solved: '課題',
    price: 100,
    available_quantity: 1,
    image_url: 'https://example.com/a.png',
    sale_starts_at: '2026-01-01T00:00:00Z',
    sale_ends_at: '2099-12-31T00:00:00Z',
  },
  poor.token,
);
const tooLong = await request(
  'POST',
  '/store/ads',
  { listing_id: poorListing.body?.listing?.id, days: 1_000 },
  poor.token,
);
expect('断られた', tooLong.status, 402);

console.log('\n=== 他社の広告の効果は見られない ===');
// 効き具合が分かると良い出し方をそのまま真似できてしまう。
expect(
  '他社の合鍵では断られた',
  (await request('GET', `/store/ads/${placementId}/metrics`, undefined, poor.token)).status,
  403,
);
expect(
  'ログインしていなければ断られた',
  (await request('GET', `/store/ads/${placementId}/metrics`, undefined, null)).status,
  401,
);

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length} 件が通りませんでした:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('すべて通りました。');
