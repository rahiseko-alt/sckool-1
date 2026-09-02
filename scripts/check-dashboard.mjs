#!/usr/bin/env node
/**
 * 経営ダッシュボードとランキングが受け入れ基準どおりかを確かめる
 * （受け入れ基準 G1・G2、要件16・25・38）。
 *
 * **要は「表示している数字が、履歴から計算し直した数字と一致するか」**。
 * 集計値をどこかに保存していれば、ここで必ずずれる。
 *
 * 使い方: サーバーを起動しておいて `node scripts/check-dashboard.mjs`
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

async function request(method, path, body) {
  const response = await fetch(new URL(path, BASE), {
    method,
    headers: { 'content-type': 'application/json', 'x-publishable-api-key': publishableKey },
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

async function createOrganization(label) {
  const account = await request('POST', '/store/accounts', {
    password: 'good-password-1234',
    organization_name: `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  return { marketId: account.body?.market_id, name: account.body?.organization_name };
}

async function createListing(marketId, price, quantity = 5) {
  const created = await request('POST', '/store/listings', {
    market_id: marketId,
    title: `商品 ${Math.random().toString(36).slice(2, 8)}`,
    description: '説明',
    target_customer: 'ターゲット',
    problem_solved: '課題',
    price,
    available_quantity: quantity,
    image_url: 'https://example.com/a.png',
    sale_starts_at: '2026-01-01T00:00:00Z',
    sale_ends_at: '2099-12-31T00:00:00Z',
  });
  return created.body?.listing;
}

console.log('\n=== 準備: 売買と広告を一通り起こす ===');
const seller = await createOrganization('DASH SELLER');
const buyer = await createOrganization('DASH BUYER');
const listingA = await createListing(seller.marketId, 3_000);
const listingB = await createListing(seller.marketId, 2_000);

// 売る側: 3,000 が2件、2,000 が1件 → 売上 8,000
await request('POST', '/store/purchases', {
  market_id: buyer.marketId,
  listing_id: listingA.id,
});
await request('POST', '/store/purchases', {
  market_id: buyer.marketId,
  listing_id: listingA.id,
});
await request('POST', '/store/purchases', {
  market_id: buyer.marketId,
  listing_id: listingB.id,
});
// 売る側: 広告に 1日分 500
const ad = await request('POST', '/store/ads', {
  market_id: seller.marketId,
  listing_id: listingA.id,
  days: 1,
});
expect('広告を買えた', ad.status, 201);

console.log('\n=== ダッシュボードの数字（受け入れ基準 G1）===');
const dashboard = await request('GET', `/store/dashboard?market_id=${seller.marketId}`);
expect('取れた', dashboard.status, 200);
expect('売上', dashboard.body?.stats?.revenue, 8_000);
expect('広告費', dashboard.body?.stats?.ad_spend, 500);
expect('支出', dashboard.body?.stats?.expenses, 500);
expect('利益', dashboard.body?.stats?.profit, 7_500);
expect('販売件数', dashboard.body?.stats?.sales_count, 3);
expect('通常残高', dashboard.body?.balance?.normal, 100_000 + 8_000 - 500);

console.log('\n=== 履歴から計算し直した値と一致する（同 G1 の要）===');
const history = await request('GET', `/store/transactions?market_id=${seller.marketId}`);
const recomputedRevenue = (history.body?.transactions ?? [])
  .filter((row) => row.kind === 'sale')
  .reduce((sum, row) => sum + row.amount, 0);
const recomputedAdSpend = (history.body?.transactions ?? [])
  .filter((row) => row.kind === 'ad_spend')
  .reduce((sum, row) => sum - row.amount, 0);
expect('売上が一致', dashboard.body?.stats?.revenue, recomputedRevenue);
expect('広告費が一致', dashboard.body?.stats?.ad_spend, recomputedAdSpend);
expect('残高が一致', dashboard.body?.balance?.total, history.body?.balance?.total);

console.log('\n=== 商品ごとの売上が出る（要件16）===');
const perProduct = dashboard.body?.product_sales ?? [];
expect('2商品ぶんある', perProduct.length, 2);
expect('多い順に並ぶ', perProduct[0]?.revenue >= perProduct[1]?.revenue, true);
expect('商品名が付く', typeof perProduct[0]?.title, 'string');

console.log('\n=== 売上推移が日ごとに出て、抜けが無い（要件16）===');
const chart = dashboard.body?.revenue_chart ?? [];
expect('14日ぶんある', chart.length, 14);
expect(
  '売れなかった日も0で埋まる',
  chart.every((point) => typeof point.revenue === 'number'),
  true,
);
expect('日付が並んでいる', chart[0]?.date < chart[chart.length - 1]?.date, true);

console.log('\n=== 買った側の支出も出る ===');
const buyerDashboard = await request('GET', `/store/dashboard?market_id=${buyer.marketId}`);
expect('支出', buyerDashboard.body?.stats?.expenses, 8_000);
expect('購入件数', buyerDashboard.body?.stats?.purchase_count, 3);
expect('売上は0', buyerDashboard.body?.stats?.revenue, 0);
expect('利益率は0（NaNを出さない）', buyerDashboard.body?.stats?.profit_margin, 0);

console.log('\n=== ランキングは5つの指標で切り替わる（同 G2、要件25）===');
const defaultRanking = await request('GET', '/store/ranking');
expect('取れた', defaultRanking.status, 200);
expect('5指標ある', defaultRanking.body?.available_metrics, [
  'revenue',
  'profit',
  'profit_margin',
  'customers',
  'roas',
]);

for (const metric of ['revenue', 'profit', 'profit_margin', 'customers', 'roas']) {
  const ranked = await request('GET', `/store/ranking?metric=${metric}`);
  const values = (ranked.body?.ranking ?? []).map((row) => row[metric]);
  const sorted = [...values].sort((a, b) => b - a);
  expect(`${metric} で大きい順に並ぶ`, values, sorted);
}

console.log('\n=== ランキングに Market ID は出ない（要件38）===');
expect('企業名だけ', JSON.stringify(defaultRanking.body).includes(seller.marketId), false);
const topRow = (defaultRanking.body?.ranking ?? [])[0];
expect('順位が付く', topRow?.rank, 1);
expect('企業名がある', typeof topRow?.organization_name, 'string');

console.log('\n=== 知らない指標を渡しても壊れない ===');
const fallback = await request('GET', '/store/ranking?metric=きのう');
expect('売上に戻る', fallback.body?.metric, 'revenue');

console.log('\n=== 無い企業のダッシュボードは404 ===');
expect('404が返る', (await request('GET', '/store/dashboard?market_id=MKT-ZZZZ-ZZZZ')).status, 404);

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length} 件が通りませんでした:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('すべて通りました。');
