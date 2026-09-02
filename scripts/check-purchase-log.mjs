#!/usr/bin/env node
/**
 * 先生の購入ログが受け入れ基準どおりかを、動いているサーバーで確かめる
 * （受け入れ基準 H4、要件10・22）。
 *
 * 見るのは3つ。
 *   1. 先生が商品を買え、その行がログに出るか
 *   2. **別の先生**が同じログを開いて、1人目の購入も見えるか
 *   3. 先生ごとの購入額の合計が出るか
 *
 * 使い方: サーバーを起動しておいて `node scripts/check-purchase-log.mjs`
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

async function request(method, path, { body, token } = {}) {
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

const password = process.env.ADMIN_PASSWORD ?? 'probe-password-1234';
const firstAdmin = process.env.ADMIN_IDENTIFIER ?? 'probe-admin@anon.invalid';
const secondAdmin = process.env.ADMIN_2_IDENTIFIER ?? 'probe-admin-2@anon.invalid';

async function loginAsAdmin(identifier) {
  const login = await request('POST', '/auth/user/emailpass', {
    body: { email: identifier, password },
  });
  return { status: login.status, token: login.body?.token };
}

console.log('\n=== 準備: 売る企業と商品を用意する ===');
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const seller = await request('POST', '/store/accounts', {
  body: { password: 'good-password-1234', organization_name: `LOG SELLER ${stamp}` },
});
expect('企業を作れた', seller.status, 201);
const sellerId = seller.body?.market_id;

const listing = (
  await request('POST', '/store/listings', {
    body: {
      market_id: sellerId,
      title: `商品 ${stamp}`,
      description: '説明',
      target_customer: 'ターゲット',
      problem_solved: '課題',
      price: 2_500,
      available_quantity: 10,
      image_url: 'https://example.com/a.png',
      sale_starts_at: '2026-01-01T00:00:00Z',
      sale_ends_at: '2099-12-31T00:00:00Z',
    },
  })
).body?.listing;
expect('商品を出せた', typeof listing?.id, 'string');

console.log('\n=== 生徒は先生の購入ログを開けない ===');
expect('ログインしていなければ断られる', (await request('GET', '/admin/purchase-log')).status, 401);
const studentLogin = await request('POST', '/auth/customer/emailpass', {
  body: { email: sellerId, password: 'good-password-1234' },
});
expect(
  '生徒の合鍵では断られる',
  (await request('GET', '/admin/purchase-log', { token: studentLogin.body?.token })).status,
  401,
);
expect(
  '生徒の合鍵では買えない',
  (
    await request('POST', '/admin/purchases', {
      body: { listing_id: listing.id },
      token: studentLogin.body?.token,
    })
  ).status,
  401,
);

console.log('\n=== 1人目の先生が買う（受け入れ基準 H4 の前提、要件10）===');
const admin1 = await loginAsAdmin(firstAdmin);
expect('1人目の先生としてログインできた', admin1.status, 200);

const before = await request('GET', '/admin/purchase-log', { token: admin1.token });
expect('ログを開けた', before.status, 200);
const rowBefore = (before.body?.administrators ?? []).find(
  (row) => row.admin_identifier === firstAdmin,
);
expect('1人目の先生が一覧にいる', typeof rowBefore, 'object');
const countBefore = rowBefore?.purchase_count ?? 0;
const amountBefore = rowBefore?.total_amount ?? 0;

const bought = await request('POST', '/admin/purchases', {
  body: { listing_id: listing.id },
  token: admin1.token,
});
expect('先生が商品を買えた', bought.status, 201);
expect('買った企業の名前が返る', bought.body?.seller_name, seller.body?.organization_name);
expect('先生にも MP の残高がある', typeof bought.body?.balance?.total, 'number');

console.log('\n=== 買った行がログに出る（受け入れ基準 H4）===');
const after = await request('GET', '/admin/purchase-log', { token: admin1.token });
const rowAfter = (after.body?.administrators ?? []).find(
  (row) => row.admin_identifier === firstAdmin,
);
expect('購入回数が1つ増えた', rowAfter?.purchase_count, countBefore + 1);
expect('買った額が2,500増えた', rowAfter?.total_amount, amountBefore + 2_500);

const boughtFrom = (rowAfter?.sellers ?? []).find((row) => row.market_id === sellerId);
expect('買った先が出ている', typeof boughtFrom, 'object');
expect(
  '買った先に企業名が付いている',
  boughtFrom?.organization_name,
  seller.body?.organization_name,
);

const recent = (after.body?.recent ?? []).find(
  (row) => row.market_id === sellerId && row.admin_identifier === firstAdmin,
);
expect('新しい順の明細に出ている', typeof recent, 'object');
expect('明細の金額が2,500', recent?.amount, 2_500);

console.log('\n=== 別の先生からも同じ購入が見える（受け入れ基準 H4）===');
const admin2 = await loginAsAdmin(secondAdmin);
expect('2人目の先生としてログインできた', admin2.status, 200);

const seenByOther = await request('GET', '/admin/purchase-log', { token: admin2.token });
expect('2人目もログを開けた', seenByOther.status, 200);
const firstSeenByOther = (seenByOther.body?.administrators ?? []).find(
  (row) => row.admin_identifier === firstAdmin,
);
expect('1人目の先生の購入が見える', firstSeenByOther?.purchase_count, rowAfter?.purchase_count);
expect('1人目の買った額も見える', firstSeenByOther?.total_amount, rowAfter?.total_amount);
expect(
  '2人目の先生自身も一覧にいる（まだ買っていなくても）',
  typeof (seenByOther.body?.administrators ?? []).find(
    (row) => row.admin_identifier === secondAdmin,
  ),
  'object',
);

console.log('\n=== 2人目も買うと、企業側に先生の人数が出る（要件22）===');
const bought2 = await request('POST', '/admin/purchases', {
  body: { listing_id: listing.id },
  token: admin2.token,
});
expect('2人目の先生も買えた', bought2.status, 201);

const both = await request('GET', '/admin/purchase-log', { token: admin1.token });
const sellerRow = (both.body?.sellers ?? []).find((row) => row.market_id === sellerId);
expect('企業別の行がある', typeof sellerRow, 'object');
expect('2人の先生から買われている', sellerRow?.admin_count, 2);
expect('企業が受け取った額は5,000', sellerRow?.amount, 5_000);
expect('回数は2回', sellerRow?.count, 2);

console.log('\n=== 合計が出る ===');
expect('先生の人数が出る', both.body?.totals?.administrators >= 2, true);
expect('購入件数の合計が数字', typeof both.body?.totals?.purchase_count, 'number');
expect('金額の合計が数字', typeof both.body?.totals?.total_amount, 'number');

console.log('\n=== 売った企業の売上に入っている（受け入れ基準 G1 と揃う）===');
const dashboard = (await request('GET', `/store/dashboard?market_id=${sellerId}`)).body;
expect('企業の売上は5,000', dashboard?.stats?.revenue, 5_000);
expect('企業の販売件数は2', dashboard?.stats?.sales_count, 2);

console.log('\n=== 売り切れ・存在しない商品は買えない ===');
expect(
  '商品の指定が無ければ断られる',
  (await request('POST', '/admin/purchases', { body: {}, token: admin1.token })).status,
  400,
);
expect(
  '存在しない商品は404',
  (
    await request('POST', '/admin/purchases', {
      body: { listing_id: 'lst_nothing' },
      token: admin1.token,
    })
  ).status,
  404,
);

console.log('\n=== まとめ ===');
if (failures.length > 0) {
  console.error(`${failures.length}件が通りませんでした:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('全て通りました。');
