#!/usr/bin/env node
/**
 * 商品の登録と市場一覧が受け入れ基準どおりかを、動いているサーバーで確かめる
 * （受け入れ基準 C1・C2・C3、要件6・7・38）。
 *
 * 使い方: サーバーを起動しておいて `node scripts/check-listings.mjs`
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

console.log('\n=== 準備: 企業を1つ作る ===');
const account = await request('POST', '/store/accounts', {
  password: 'good-password-1234',
  organization_name: `LISTING ${Date.now()}`,
});
expect('作れた', account.status, 201);
const marketId = account.body?.market_id;
currentToken = await login(marketId);
expect('合鍵を受け取った', typeof currentToken, 'string');
const organizationName = account.body?.organization_name;

/** 通る入力。各テストはここから1つだけ壊す。 */
const validListing = () => ({
  market_id: marketId,
  title: `ロゴ制作 ${Math.random().toString(36).slice(2, 8)}`,
  description: 'SNS用のロゴを作ります',
  target_customer: 'SNSを始めたばかりの企業',
  problem_solved: '見た目が揃わず覚えてもらえない',
  price: 2_500,
  available_quantity: 10,
  image_url: 'https://example.com/logo.png',
  sale_starts_at: '2026-01-01T00:00:00Z',
  sale_ends_at: '2099-12-31T00:00:00Z',
});

console.log('\n=== 必須項目が欠けると、欠けた項目を指して断る（受け入れ基準 C1）===');
const missing = await request('POST', '/store/listings', {
  market_id: marketId,
  title: 'ロゴだけ',
});
expect('断られた', missing.status, 400);
const missingFields = (missing.body?.problems ?? []).map((problem) => problem.field).sort();
expect('足りない項目を全部返す', missingFields, [
  'available_quantity',
  'description',
  'image_url',
  'price',
  'problem_solved',
  'sale_ends_at',
  'sale_starts_at',
  'target_customer',
]);

console.log('\n=== ターゲット顧客と解決する課題も必須（要件5・6）===');
const withoutTarget = await request('POST', '/store/listings', {
  ...validListing(),
  target_customer: '',
});
expect('断られた', withoutTarget.status, 400);
expect(
  'その項目を指している',
  (withoutTarget.body?.problems ?? []).some((problem) => problem.field === 'target_customer'),
  true,
);

console.log('\n=== 価格は1MP以上の整数だけ（同 C3）===');
for (const [label, price] of [
  ['0', 0],
  ['負の数', -100],
  ['小数', 1.5],
]) {
  expect(
    `${label}は断られた`,
    (await request('POST', '/store/listings', { ...validListing(), price })).status,
    400,
  );
}

console.log('\n=== 全部そろえば登録できる（同 C1）===');
const created = await request('POST', '/store/listings', validListing());
expect('登録できた', created.status, 201);
expect('買える状態で出る', created.body?.listing?.can_buy, true);
expect('企業名が付く', created.body?.listing?.organization_name, organizationName);

console.log('\n=== 市場一覧に出る（要件7）===');
const market = await request('GET', '/store/listings');
expect('一覧を取れた', market.status, 200);
const found = (market.body?.listings ?? []).find((item) => item.id === created.body?.listing?.id);
expect('さっきの商品がある', found !== undefined, true);

console.log('\n=== 出品者は企業名だけで、Market ID は出さない（要件38）===');
expect('企業名がある', typeof found?.organization_name, 'string');
expect(
  '一覧のどこにも Market ID が出ていない',
  JSON.stringify(market.body).includes(marketId),
  false,
);

console.log('\n=== 販売期間が過ぎた商品は買えないと分かる（同 C2）===');
const ended = await request('POST', '/store/listings', {
  ...validListing(),
  sale_starts_at: '2025-01-01T00:00:00Z',
  sale_ends_at: '2025-02-01T00:00:00Z',
});
expect('登録はできる', ended.status, 201);
const endedDetail = await request('GET', `/store/listings/${ended.body?.listing?.id}`);
expect('買えない', endedDetail.body?.listing?.can_buy, false);
expect('理由は「終わった」', endedDetail.body?.listing?.unavailable_reason, 'ended');

console.log('\n=== まだ始まっていない商品も買えないと分かる（同 C2）===');
const future = await request('POST', '/store/listings', {
  ...validListing(),
  sale_starts_at: '2099-01-01T00:00:00Z',
  sale_ends_at: '2099-12-31T00:00:00Z',
});
const futureDetail = await request('GET', `/store/listings/${future.body?.listing?.id}`);
expect('買えない', futureDetail.body?.listing?.can_buy, false);
expect('理由は「まだ」', futureDetail.body?.listing?.unavailable_reason, 'not_started');

console.log('\n=== 無い商品は404 ===');
expect('404が返る', (await request('GET', '/store/listings/lst_nothing')).status, 404);

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length} 件が通りませんでした:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('すべて通りました。');
