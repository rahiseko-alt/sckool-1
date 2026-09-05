#!/usr/bin/env node
/**
 * 管理者の全企業一覧が受け入れ基準どおりかを、動いているサーバーで確かめる
 * （受け入れ基準 H1、要件26）。
 *
 * 見るのは3つ。
 *   1. 登録した企業が全て行として並ぶか
 *   2. その行の数字が、その企業のダッシュボードの数字と一致するか
 *   3. 生徒のアカウントでは開けないか
 *
 * 使い方: サーバーを起動しておいて `node scripts/check-admin.mjs`
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

async function createOrganization(label) {
  const created = await request('POST', '/store/accounts', {
    body: {
      password,
      organization_name: `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    },
  });
  const marketId = created.body?.market_id;
  return {
    marketId,
    name: created.body?.organization_name,
    token: await loginAsOrganization(marketId),
  };
}

console.log('\n=== 準備: 売買と広告を一通り起こす ===');
const seller = await createOrganization('ADMIN SELLER');
const buyer = await createOrganization('ADMIN BUYER');
expect('売る側を作れた', typeof seller.marketId, 'string');
expect('買う側を作れた', typeof buyer.marketId, 'string');

const listing = (
  await request('POST', '/store/listings', {
    body: {
      title: `商品 ${Math.random().toString(36).slice(2, 8)}`,
      description: '説明',
      target_customer: 'ターゲット',
      problem_solved: '課題',
      price: 4_000,
      available_quantity: 5,
      image_url: 'https://example.com/a.png',
      sale_starts_at: '2026-01-01T00:00:00Z',
      sale_ends_at: '2099-12-31T00:00:00Z',
    },
    token: seller.token,
  })
).body?.listing;
expect('商品を出せた', typeof listing?.id, 'string');

// 売る側: 4,000 が2件 → 売上 8,000／買う側: 支出 8,000
for (let i = 0; i < 2; i += 1) {
  const purchase = await request('POST', '/store/purchases', {
    body: { listing_id: listing.id },
    token: buyer.token,
  });
  expect(`${i + 1}件目を買えた`, purchase.status, 201);
}

// 売る側は広告も出す（一覧の広告費が0でない状態で見るため）。
const placement = await request('POST', '/store/ads', {
  body: { listing_id: listing.id, days: 3 },
  token: seller.token,
});
expect('広告を出せた', placement.status, 201);
const adSpend = placement.body?.placement?.spend;
expect('広告費が数字で返る', typeof adSpend, 'number');

console.log('\n=== 生徒のアカウントでは開けない（受け入れ基準 H1）===');
expect(
  'ログインしていなければ断られる',
  (await request('GET', '/admin/organizations')).status,
  401,
);

const studentLogin = await request('POST', '/auth/customer/emailpass', {
  body: { email: seller.marketId, password },
});
expect('生徒としてログインできた', studentLogin.status, 200);
const studentToken = studentLogin.body?.token;
expect('生徒の合鍵を受け取った', typeof studentToken, 'string');

expect(
  '生徒の合鍵では断られる',
  (await request('GET', '/admin/organizations', { token: studentToken })).status,
  401,
);

console.log('\n=== 管理者は全企業を1画面で見られる（受け入れ基準 H1）===');
const adminLogin = await request('POST', '/auth/user/emailpass', {
  body: {
    email: process.env.ADMIN_IDENTIFIER ?? 'probe-admin@anon.invalid',
    password: process.env.ADMIN_PASSWORD ?? 'probe-password-1234',
  },
});
expect('管理者としてログインできた', adminLogin.status, 200);
const adminToken = adminLogin.body?.token;

const overview = await request('GET', '/admin/organizations', { token: adminToken });
expect('一覧を開けた', overview.status, 200);

const list = Array.isArray(overview.body?.organizations) ? overview.body.organizations : [];
const names = list.map((row) => row.organization_name);
expect('売る側が行として並んでいる', names.includes(seller.name), true);
expect('買う側が行として並んでいる', names.includes(buyer.name), true);
expect('企業数が行数と一致する', overview.body?.totals?.organizations, list.length);

const sellerRow = list.find((row) => row.market_id === seller.marketId);
const buyerRow = list.find((row) => row.market_id === buyer.marketId);
expect('売る側の行がある', typeof sellerRow, 'object');
expect('買う側の行がある', typeof buyerRow, 'object');

console.log('\n=== 行の数字が企業ダッシュボードと一致する（受け入れ基準 H1・G1）===');
for (const [label, org, row] of [
  ['売る側', seller, sellerRow],
  ['買う側', buyer, buyerRow],
]) {
  const dashboard = (await request('GET', '/store/dashboard', { token: org.token })).body;
  expect(`${label}: 残高が一致`, row?.balance_total, dashboard?.balance?.total);
  expect(`${label}: ボーナス残高が一致`, row?.balance_bonus, dashboard?.balance?.bonus);
  expect(`${label}: 売上が一致`, row?.revenue, dashboard?.stats?.revenue);
  expect(`${label}: 支出が一致`, row?.expenses, dashboard?.stats?.expenses);
  expect(`${label}: 利益が一致`, row?.profit, dashboard?.stats?.profit);
  expect(`${label}: 利益率が一致`, row?.profit_margin, dashboard?.stats?.profit_margin);
  expect(`${label}: 広告費が一致`, row?.ad_spend, dashboard?.stats?.ad_spend);
}

// 実際に起こした売買がそのまま出ていること。一致するだけなら両方0でも通ってしまう。
expect('売る側の売上は8,000', sellerRow?.revenue, 8_000);
expect('売る側の広告費は払った額', sellerRow?.ad_spend, adSpend);
expect('買う側の支出は8,000', buyerRow?.expenses, 8_000);
expect('売る側の商品数は1', sellerRow?.listing_count, 1);
expect('買う側の商品数は0', buyerRow?.listing_count, 0);

console.log('\n=== MP の勘定が合っている（受け入れ基準 B3）===');
expect('説明できない差が無い', overview.body?.supply?.matches, true);
expect(
  '残高の合計は一覧の合計と同じ',
  overview.body?.supply?.balances_total,
  overview.body?.totals?.balance_total,
);
// 企業として登録されていない口座（動作確認用のもの）の分は別に数える。
// 0 とは限らないので、数字が返ることだけを見る。
expect('企業でない相手の MP を別に数えている', typeof overview.body?.supply?.unassigned, 'number');

console.log('\n=== 並べ替えできる ===');
const byName = await request('GET', '/admin/organizations?sort=organization_name', {
  token: adminToken,
});
expect('企業名で並べ替えられる', byName.body?.sort, 'organization_name');
const sortedNames = byName.body?.organizations?.map((row) => row.organization_name) ?? [];
expect(
  '企業名が順に並んでいる',
  sortedNames.every(
    (name, index) => index === 0 || sortedNames[index - 1].localeCompare(name, 'ja') <= 0,
  ),
  true,
);

const byRevenue = await request('GET', '/admin/organizations?sort=revenue', { token: adminToken });
const revenues = byRevenue.body?.organizations?.map((row) => row.revenue) ?? [];
expect(
  '売上が大きい順に並んでいる',
  revenues.every((value, index) => index === 0 || revenues[index - 1] >= value),
  true,
);

const unknownSort = await request('GET', '/admin/organizations?sort=market_id', {
  token: adminToken,
});
expect('知らない並べ替えは売上順に戻す', unknownSort.body?.sort, 'revenue');

console.log('\n=== まとめ ===');
if (failures.length > 0) {
  console.error(`${failures.length}件が通りませんでした:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('全て通りました。');
