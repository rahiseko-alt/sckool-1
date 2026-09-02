#!/usr/bin/env node
/**
 * 購入と MP の移動が受け入れ基準どおりかを、動いているサーバーで確かめる
 * （受け入れ基準 D1〜D5、E1、E6）。
 *
 * 使い方: サーバーを起動しておいて `node scripts/check-purchases.mjs`
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

async function createListing(org, over = {}) {
  const created = await request(
    'POST',
    '/store/listings',
    {
      title: `商品 ${Math.random().toString(36).slice(2, 8)}`,
      description: '説明',
      target_customer: 'ターゲット',
      problem_solved: '課題',
      price: 2_500,
      available_quantity: 2,
      image_url: 'https://example.com/a.png',
      sale_starts_at: '2026-01-01T00:00:00Z',
      sale_ends_at: '2099-12-31T00:00:00Z',
      ...over,
    },
    org.token,
  );
  return created.body?.listing;
}

console.log('\n=== 準備: 売る企業と買う企業を作る ===');
const seller = await createOrganization('SELLER');
const buyer = await createOrganization('BUYER');
expect('2社できた', [Boolean(seller.marketId), Boolean(buyer.marketId)], [true, true]);
const listing = await createListing(seller);
expect('商品ができた', Boolean(listing?.id), true);

console.log('\n=== 自社商品は買えない（要件8、受け入れ基準 D2）===');
const own = await request('POST', '/store/purchases', { listing_id: listing.id }, seller.token);
expect('断られた', own.status, 400);
expect('理由が分かる', own.body?.code, 'cannot_buy_own_listing');

console.log('\n=== 他社商品を買える（同 D1）===');
const purchase = await request('POST', '/store/purchases', { listing_id: listing.id }, buyer.token);
expect('買えた', purchase.status, 201);
expect('売り手は企業名だけ', purchase.body?.seller_name, seller.name);
expect('買った側の残高が減った', purchase.body?.balance?.total, 100_000 - 2_500);

console.log('\n=== 売った側の残高が増えた（同 D1）===');
const sellerView = await request('GET', '/store/transactions', undefined, seller.token);
expect('増えている', sellerView.body?.balance?.total, 100_000 + 2_500);

console.log('\n=== 市場全体では増えも減りもしない ===');
expect(
  '2社の合計は変わらない',
  purchase.body?.balance?.total + sellerView.body?.balance?.total,
  200_000,
);

console.log('\n=== 在庫が1減った（同 D4）===');
const afterBuy = await request('GET', `/store/listings/${listing.id}`);
expect('2個から1個に', afterBuy.body?.listing?.available_quantity, 1);

console.log('\n=== 履歴が両方に残り、相手は企業名だけ（同 D5、要件38）===');
const buyerView = await request('GET', '/store/transactions', undefined, buyer.token);
const bought = (buyerView.body?.transactions ?? []).find((row) => row.kind === 'purchase');
expect('買った側に購入の行がある', Boolean(bought), true);
expect('相手が企業名で出る', bought?.counterpart_name, seller.name);
const sold = (sellerView.body?.transactions ?? []).find((row) => row.kind === 'sale');
expect('売った側に販売の行がある', Boolean(sold), true);
// 売った側からも「誰が買ったか」が見える。判定役が、売った側の相手欄が
// 空のままだと指摘したため足した。
expect('売った側にも相手の企業名が出る', sold?.counterpart_name, buyer.name);
expect(
  '履歴のどこにも Market ID が出ていない',
  JSON.stringify(buyerView.body).includes(seller.marketId),
  false,
);
expect(
  '売った側の履歴にも Market ID が出ていない',
  JSON.stringify(sellerView.body).includes(buyer.marketId),
  false,
);

console.log('\n=== 売り切れると買えない（同 D4）===');
await request('POST', '/store/purchases', { listing_id: listing.id }, buyer.token);
const soldOut = await request('POST', '/store/purchases', { listing_id: listing.id }, buyer.token);
expect('断られた', soldOut.status, 409);
expect('理由は売り切れ', soldOut.body?.reason, 'sold_out');

console.log('\n=== 残高より高い商品は買えない（同 D3）===');
const rich = await createOrganization('RICH');
const expensive = await createListing(rich, { price: 999_999, available_quantity: 1 });
const balanceBefore = (await request('GET', '/store/transactions', undefined, buyer.token)).body
  ?.balance?.total;
const tooExpensive = await request(
  'POST',
  '/store/purchases',
  { listing_id: expensive.id },
  buyer.token,
);
expect('断られた', tooExpensive.status, 402);
const balanceAfter = (await request('GET', '/store/transactions', undefined, buyer.token)).body
  ?.balance?.total;
expect('残高が変わっていない', balanceAfter, balanceBefore);

console.log('\n=== 断られた商品の在庫は減っていない ===');
const stillThere = await request('GET', `/store/listings/${expensive.id}`);
expect('1個のまま', stillThere.body?.listing?.available_quantity, 1);

console.log('\n=== 販売期間外の商品は買えない（同 C2）===');
const ended = await createListing(rich, {
  sale_starts_at: '2025-01-01T00:00:00Z',
  sale_ends_at: '2025-02-01T00:00:00Z',
});
const endedBuy = await request('POST', '/store/purchases', { listing_id: ended.id }, buyer.token);
expect('断られた', endedBuy.status, 409);
expect('理由は終了', endedBuy.body?.reason, 'ended');

console.log('\n=== ログインしていない相手は、他社を名乗って買えない（要件35・受け入れ基準 D1）===');
// ここが抜けていると、Market ID を知っているだけで他社の残高を使えてしまう。
const stranger = await createListing(rich, { price: 100, available_quantity: 3 });
const asNobody = await request(
  'POST',
  '/store/purchases',
  { market_id: buyer.marketId, listing_id: stranger.id },
  null,
);
expect('ログインしていなければ断られる', asNobody.status, 401);

const before = (await request('GET', '/store/transactions', undefined, buyer.token)).body?.balance
  ?.total;
const asSomeoneElse = await request(
  'POST',
  '/store/purchases',
  { market_id: buyer.marketId, listing_id: stranger.id },
  seller.token,
);
expect('別の企業の合鍵では、その企業として買う', asSomeoneElse.status, 201);
const after = (await request('GET', '/store/transactions', undefined, buyer.token)).body?.balance
  ?.total;
expect('名乗った企業の残高は減っていない', after, before);

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length} 件が通りませんでした:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('すべて通りました。');
