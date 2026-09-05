#!/usr/bin/env node
/**
 * 取引の偏り（相互取引率・購入集中率）を、動いているサーバーで確かめる
 * （受け入れ基準 H2・H3、要件20〜22）。
 *
 * 実際に「2社の間だけで売買する組」と「1社に買いが偏る企業」を作り、
 * その2つが数字に出るかを見る。
 *
 * 使い方: サーバーを起動しておいて `node scripts/check-trade-analysis.mjs`
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

const password = 'good-password-1234';

/** 生徒としてログインして合鍵をもらう。企業として行う操作に要る。 */
async function loginAsOrganization(marketId, pass = 'good-password-1234') {
  const result = await request('POST', '/auth/customer/emailpass', {
    body: { email: marketId, password: pass },
  });
  return result.body?.token;
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function createOrganization(label) {
  const created = await request('POST', '/store/accounts', {
    body: { password, organization_name: `${label} ${stamp}` },
  });
  const marketId = created.body?.market_id;
  return {
    marketId,
    name: created.body?.organization_name,
    token: await loginAsOrganization(marketId),
  };
}

async function createListing(org, price) {
  const created = await request('POST', '/store/listings', {
    body: {
      title: `商品 ${Math.random().toString(36).slice(2, 8)}`,
      description: '説明',
      target_customer: 'ターゲット',
      problem_solved: '課題',
      price,
      available_quantity: 20,
      image_url: 'https://example.com/a.png',
      sale_starts_at: '2026-01-01T00:00:00Z',
      sale_ends_at: '2099-12-31T00:00:00Z',
    },
    token: org.token,
  });
  return created.body?.listing;
}

async function buy(buyer, listingId) {
  const purchase = await request('POST', '/store/purchases', {
    body: { listing_id: listingId },
    token: buyer.token,
  });
  return purchase.status;
}

console.log('\n=== 準備: 買い合う2社と、広く売る1社を作る ===');
// PAIR-X と PAIR-Y は互いとしか取引しない（買い合い）。
const pairX = await createOrganization('PAIR X');
const pairY = await createOrganization('PAIR Y');
// OPEN-A は複数の相手から買う。
const openA = await createOrganization('OPEN A');
const openB = await createOrganization('OPEN B');
const openC = await createOrganization('OPEN C');

for (const org of [pairX, pairY, openA, openB, openC]) {
  expect(`${org.name} を作れた`, typeof org.marketId, 'string');
}

const listingX = await createListing(pairX, 2_000);
const listingY = await createListing(pairY, 2_000);
const listingB = await createListing(openB, 1_000);
const listingC = await createListing(openC, 1_000);

// 買い合い: X→Y と Y→X をそれぞれ3回
for (let i = 0; i < 3; i += 1) {
  expect(`X が Y から買えた（${i + 1}回目）`, await buy(pairX, listingY.id), 201);
  expect(`Y が X から買えた（${i + 1}回目）`, await buy(pairY, listingX.id), 201);
}

// 偏り: A は B から4回、C から1回買う（購入集中率 80%）
for (let i = 0; i < 4; i += 1) {
  expect(`A が B から買えた（${i + 1}回目）`, await buy(openA, listingB.id), 201);
}
expect('A が C から買えた', await buy(openA, listingC.id), 201);

console.log('\n=== 生徒のアカウントでは開けない ===');
expect(
  'ログインしていなければ断られる',
  (await request('GET', '/admin/trade-analysis')).status,
  401,
);

const studentLogin = await request('POST', '/auth/customer/emailpass', {
  body: { email: pairX.marketId, password },
});
expect(
  '生徒の合鍵では断られる',
  (await request('GET', '/admin/trade-analysis', { token: studentLogin.body?.token })).status,
  401,
);

console.log('\n=== 管理者が取引の偏りを見られる（受け入れ基準 H2・H3）===');
const adminLogin = await request('POST', '/auth/user/emailpass', {
  body: {
    email: process.env.ADMIN_IDENTIFIER ?? 'probe-admin@anon.invalid',
    password: process.env.ADMIN_PASSWORD ?? 'probe-password-1234',
  },
});
expect('管理者としてログインできた', adminLogin.status, 200);
const adminToken = adminLogin.body?.token;

const analysis = await request('GET', '/admin/trade-analysis', { token: adminToken });
expect('開けた', analysis.status, 200);
expect('しきい値の既定値は30%', analysis.body?.threshold, 30);

const pairs = analysis.body?.mutual_trade ?? [];
const pairOf = (one, other) =>
  pairs.find(
    (pair) =>
      (pair.a.market_id === one && pair.b.market_id === other) ||
      (pair.a.market_id === other && pair.b.market_id === one),
  );

console.log('\n--- 買い合った2社（受け入れ基準 H2）---');
const xy = pairOf(pairX.marketId, pairY.marketId);
expect('X と Y の組がある', typeof xy, 'object');
// X→Y が 2,000×3、Y→X が 2,000×3 で 12,000。互いとしか取引していないので率は50%。
expect('2社の間の取引額は12,000', xy?.between, 12_000);
expect('相互取引率は50%', xy?.rate, 50);
expect('しきい値を超えた印が付く', xy?.flagged, true);
expect('同じ組が2回出てこない', pairs.filter((pair) => pair === xy).length, 1);

console.log('\n--- 広く取引した企業（受け入れ基準 H2）---');
const ab = pairOf(openA.marketId, openB.marketId);
expect('A と B の組がある', typeof ab, 'object');
// A は 4,000 を B から、1,000 を C から買った。B は A にしか売っていない。
// 率 = 4,000 ÷ (Aの5,000 + Bの4,000) = 44.4%
expect('A と B の相互取引率は44.4%', ab?.rate, 44.4);

const ac = pairOf(openA.marketId, openC.marketId);
// 率 = 1,000 ÷ (Aの5,000 + Cの1,000) = 16.7%。しきい値を超えない。
expect('A と C の相互取引率は16.7%', ac?.rate, 16.7);
expect('A と C には印が付かない', ac?.flagged, false);

console.log('\n--- 購入集中率（受け入れ基準 H3）---');
const concentrations = analysis.body?.purchase_concentration ?? [];
const rowFor = (marketId) => concentrations.find((row) => row.organization.market_id === marketId);

const rowA = rowFor(openA.marketId);
expect('A の行がある', typeof rowA, 'object');
expect('A の一番多い購入先は B', rowA?.top_seller?.market_id, openB.marketId);
expect('A の購入集中率は80%', rowA?.rate, 80);
expect('A は2社から買っている', rowA?.seller_count, 2);
expect('A が買った額は5,000', rowA?.total_amount, 5_000);

const rowX = rowFor(pairX.marketId);
expect('X は1社からしか買っていないので100%', rowX?.rate, 100);
expect('X の相手の数は1', rowX?.seller_count, 1);

console.log('\n--- 企業名が出る（先生が誰か分かるように）---');
expect('組に企業名が入っている', xy?.a?.organization_name !== null, true);
expect('購入集中率に企業名が入っている', rowA?.organization?.organization_name, openA.name);

console.log('\n--- 率の高い順に並ぶ ---');
const rates = pairs.map((pair) => pair.rate);
expect(
  '相互取引率が高い順',
  rates.every((rate, index) => index === 0 || rates[index - 1] >= rate),
  true,
);

console.log('\n--- しきい値を変えられる ---');
const strict = await request('GET', '/admin/trade-analysis?threshold=60', { token: adminToken });
expect('しきい値を60%にできる', strict.body?.threshold, 60);
const xyStrict = (strict.body?.mutual_trade ?? []).find(
  (pair) =>
    (pair.a.market_id === pairX.marketId && pair.b.market_id === pairY.marketId) ||
    (pair.a.market_id === pairY.marketId && pair.b.market_id === pairX.marketId),
);
expect('60%なら買い合いにも印が付かない', xyStrict?.flagged, false);

console.log('\n=== まとめ ===');
if (failures.length > 0) {
  console.error(`${failures.length}件が通りませんでした:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('全て通りました。');
