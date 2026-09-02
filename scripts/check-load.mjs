#!/usr/bin/env node
/**
 * 60社が**同時に**購入しても残高と在庫が狂わないことを、動いているサーバーで確かめる
 * （受け入れ基準 K1、B3、D3、D4）。
 *
 * 使い方: サーバーを起動しておいて `node scripts/check-load.mjs`
 *         ポートを変えたいときは `API_BASE_URL=http://localhost:9200 node scripts/check-load.mjs`
 *
 * 1件ずつ順番に買う検査（check-purchases.mjs）では**絶対に出ない種類の壊れ方**を探す。
 * 「残高を読む→引けるか見る→書く」のあいだに他の購入が割り込むと、
 * 在庫より多く売れたり残高が負になったりする。割り込みは、同時に投げたときにしか起きない。
 *
 * データベースは他の作業と共有している。**数えるのはこの検査が作った企業と商品だけ**に
 * 絞ること（絞らないと他の作業のデータが混ざり、合計が合わなくなる）。
 */

import { Client } from 'pg';

const BASE = process.env.API_BASE_URL ?? 'http://localhost:9000';
const connectionString =
  process.env.DATABASE_URL ?? 'postgres://medusa:medusa@localhost:5432/sckool';

/** 何社で試すか（受け入れ基準 K1 が言う「60企業」）。 */
const COMPANIES = Number(process.env.LOAD_COMPANIES ?? 60);

/** 初期資金。/store/accounts が配る額と同じ。 */
const INITIAL_FUNDS = 100_000;

const PASSWORD = 'good-password-1234';

/** この実行で作ったものだけを見分けるための印。 */
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const db = new Client({ connectionString });
await db.connect();
const { rows: keyRows } = await db.query(
  `SELECT token FROM api_key WHERE type = 'publishable' AND revoked_at IS NULL
   ORDER BY created_at DESC LIMIT 1`,
);
const publishableKey = keyRows[0]?.token;
if (!publishableKey) {
  console.error('公開鍵がありません。先に pnpm run seed を実行してください。');
  await db.end();
  process.exit(1);
}

const failures = [];
function expect(label, actual, wanted) {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  console.log(`  ${ok ? '通った' : '通らない'}: ${label}（${JSON.stringify(actual)}）`);
  if (!ok) failures.push(`${label}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(wanted)}`);
}

async function request(method, path, body, token) {
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

/**
 * 同時に投げる。**先に全部の約束を作ってから待つ**のが肝で、
 * for の中で await すると1件ずつ順番になり、割り込みが起きなくなる。
 */
function fireTogether(tasks) {
  return Promise.all(tasks.map((task) => task()));
}

/** 一度に投げる数を抑えつつ、束の中では同時に投げる。 */
async function inWaves(tasks, size) {
  const results = [];
  for (let start = 0; start < tasks.length; start += size) {
    results.push(...(await fireTogether(tasks.slice(start, start + size))));
  }
  return results;
}

async function createCompany(index) {
  const account = await request('POST', '/store/accounts', {
    password: PASSWORD,
    organization_name: `LOAD ${RUN} ${String(index).padStart(3, '0')}`,
  });
  const marketId = account.body?.market_id;
  if (!marketId) throw new Error(`企業を作れませんでした: ${JSON.stringify(account.body)}`);
  const login = await request('POST', '/auth/customer/emailpass', {
    email: marketId,
    password: PASSWORD,
  });
  return { marketId, name: account.body.organization_name, token: login.body?.token };
}

async function createListing(company, over) {
  const created = await request(
    'POST',
    '/store/listings',
    {
      title: `LOAD ${RUN} ${Math.random().toString(36).slice(2, 8)}`,
      description: '負荷の検査に使う商品',
      target_customer: '検査',
      problem_solved: '同時購入で壊れないか',
      image_url: 'https://example.com/a.png',
      sale_starts_at: '2026-01-01T00:00:00Z',
      sale_ends_at: '2099-12-31T00:00:00Z',
      ...over,
    },
    company.token,
  );
  const listing = created.body?.listing;
  if (!listing) throw new Error(`商品を作れませんでした: ${JSON.stringify(created.body)}`);
  return listing;
}

const buy = (company, listingId) => () =>
  request('POST', '/store/purchases', { listing_id: listingId }, company.token);

const startedAt = Date.now();

console.log(`\n=== 準備: ${COMPANIES}社を作る（印 ${RUN}）===`);
const companies = await inWaves(
  Array.from({ length: COMPANIES }, (_, index) => () => createCompany(index)),
  10,
);
expect(`${COMPANIES}社できた`, companies.length, COMPANIES);
expect(
  '全社が合鍵をもらえた',
  companies.every((company) => Boolean(company.token)),
  true,
);
const marketIds = companies.map((company) => company.marketId);

// ---------------------------------------------------------------------------

console.log('\n=== 1. 在庫5個を59社が同時に取り合う（受け入れ基準 D4）===');
const SCARCE_STOCK = 5;
const SCARCE_PRICE = 1_000;
const scarce = await createListing(companies[0], {
  price: SCARCE_PRICE,
  available_quantity: SCARCE_STOCK,
});
const scarceResults = await fireTogether(
  companies.slice(1).map((company) => buy(company, scarce.id)),
);
const scarceWon = scarceResults.filter((result) => result.status === 201).length;
expect('売れたのは在庫の数だけ', scarceWon, SCARCE_STOCK);
const scarceAfter = await request('GET', `/store/listings/${scarce.id}`);
expect('在庫は0になった', scarceAfter.body?.listing?.available_quantity, 0);
expect('在庫が負になっていない', scarceAfter.body?.listing?.available_quantity >= 0, true);

// ---------------------------------------------------------------------------

console.log('\n=== 2. 1社が残高を超える回数を同時に買う（受け入れ基準 D3）===');
const BIG_PRICE = 12_000;
const overdraftBuyer = companies[2];
const before = await request('GET', '/store/transactions', undefined, overdraftBuyer.token);
const balanceBefore = before.body?.balance?.total;
const affordable = Math.floor(balanceBefore / BIG_PRICE);
const expensive = await createListing(companies[1], {
  price: BIG_PRICE,
  available_quantity: affordable + 8,
});
const overdraftResults = await fireTogether(
  Array.from({ length: affordable + 8 }, () => buy(overdraftBuyer, expensive.id)),
);
const overdraftWon = overdraftResults.filter((result) => result.status === 201).length;
expect('買えた回数は残高で買える回数まで', overdraftWon, affordable);
const afterOverdraft = await request('GET', '/store/transactions', undefined, overdraftBuyer.token);
expect('残高が負になっていない', afterOverdraft.body?.balance?.total >= 0, true);
expect(
  '残高は買えた分だけ減った',
  afterOverdraft.body?.balance?.total,
  balanceBefore - affordable * BIG_PRICE,
);

// ---------------------------------------------------------------------------

console.log(`\n=== 3. ${COMPANIES}社が一斉に売り買いする（受け入れ基準 K1）===`);
const BULK_PRICE = 500;
const BULK_STOCK = 20;
/** 1社が何回買うか。合計 = COMPANIES × これ。 */
const ROUNDS = 5;

const bulkListings = await inWaves(
  companies.map(
    (company) => () =>
      createListing(company, { price: BULK_PRICE, available_quantity: BULK_STOCK }),
  ),
  10,
);
expect('全社が商品を出せた', bulkListings.length, COMPANIES);

// 買う相手をずらして割り当てる。自社商品は買えない（要件8）ので、必ず別の会社を指す。
const bulkTasks = [];
for (let round = 1; round <= ROUNDS; round += 1) {
  for (let index = 0; index < COMPANIES; index += 1) {
    const target = (index + round) % COMPANIES;
    bulkTasks.push(buy(companies[index], bulkListings[target].id));
  }
}
const bulkResults = await fireTogether(bulkTasks);
const bulkWon = bulkResults.filter((result) => result.status === 201).length;
console.log(`  投げた回数: ${bulkTasks.length}`);
expect('全部買えた', bulkWon, bulkTasks.length);
const bulkOther = bulkResults.filter((result) => result.status !== 201).map((r) => r.status);
expect('断られたものは無い', [...new Set(bulkOther)], []);

// ---------------------------------------------------------------------------

console.log('\n=== 確かめ1: どの企業の残高も負になっていない（受け入れ基準 K1）===');
const { rows: balanceRows } = await db.query(
  `SELECT organization_id, SUM(amount)::bigint AS total
     FROM mp_ledger_entry
    WHERE organization_id = ANY($1) AND deleted_at IS NULL
    GROUP BY organization_id`,
  [marketIds],
);
expect('全社に履歴がある', balanceRows.length, COMPANIES);
const negative = balanceRows.filter((row) => Number(row.total) < 0);
expect('残高が負の企業は0社', negative.length, 0);

console.log('\n=== 確かめ2: 残高＝取引履歴の合計（受け入れ基準 B3）===');
const dbTotals = new Map(balanceRows.map((row) => [row.organization_id, Number(row.total)]));
const apiBalances = await inWaves(
  companies.map(
    (company) => () =>
      request('GET', '/store/transactions', undefined, company.token).then((result) => ({
        marketId: company.marketId,
        total: result.body?.balance?.total,
      })),
  ),
  10,
);
const mismatched = apiBalances.filter((row) => row.total !== dbTotals.get(row.marketId));
expect('画面の残高と履歴の合計が食い違う企業は0社', mismatched.length, 0);
if (mismatched.length > 0) {
  for (const row of mismatched.slice(0, 5)) {
    console.error(`    ${row.marketId}: 画面 ${row.total} / 履歴 ${dbTotals.get(row.marketId)}`);
  }
}

console.log('\n=== 確かめ3: 市場全体の MP の総量（受け入れ基準 K1）===');
const { rows: supplyRows } = await db.query(
  `SELECT
     COALESCE(SUM(amount) FILTER (WHERE kind IN ('initial_grant', 'bonus_grant')), 0)::bigint AS granted,
     COALESCE(-SUM(amount) FILTER (WHERE kind = 'bonus_expired'), 0)::bigint AS expired,
     COALESCE(-SUM(amount) FILTER (WHERE kind = 'ad_spend'), 0)::bigint AS spent_outside,
     COALESCE(SUM(amount), 0)::bigint AS circulating
   FROM mp_ledger_entry
   WHERE organization_id = ANY($1) AND deleted_at IS NULL`,
  [marketIds],
);
const supply = supplyRows[0];
console.log(
  `  配った: ${supply.granted} / 失効: ${supply.expired} / 外へ出た: ${supply.spent_outside} / 出回っている: ${supply.circulating}`,
);
expect('配った額どおりに配られた', Number(supply.granted), COMPANIES * INITIAL_FUNDS);
expect(
  '出回っている額 = 配った額 − 失効 − 外へ出た額',
  Number(supply.circulating),
  Number(supply.granted) - Number(supply.expired) - Number(supply.spent_outside),
);

console.log('\n=== 確かめ4: 在庫より多く売れていない（受け入れ基準 D4）===');
const listingIds = [scarce.id, expensive.id, ...bulkListings.map((listing) => listing.id)];
const stocked = new Map([
  [scarce.id, SCARCE_STOCK],
  [expensive.id, affordable + 8],
  ...bulkListings.map((listing) => [listing.id, BULK_STOCK]),
]);

// 1回の購入がボーナスと通常の2行に分かれることがあるので、行ではなく group_id で数える。
const { rows: soldRows } = await db.query(
  `SELECT reference, COUNT(DISTINCT group_id)::int AS sold
     FROM mp_ledger_entry
    WHERE kind = 'purchase' AND deleted_at IS NULL AND reference = ANY($1)
    GROUP BY reference`,
  [listingIds],
);
const soldByListing = new Map(soldRows.map((row) => [row.reference, Number(row.sold)]));

const { rows: leftRows } = await db.query(
  `SELECT id, available_quantity FROM listing WHERE id = ANY($1)`,
  [listingIds],
);
const leftByListing = new Map(leftRows.map((row) => [row.id, Number(row.available_quantity)]));

const oversold = [];
const negativeStock = [];
const inconsistent = [];
for (const id of listingIds) {
  const sold = soldByListing.get(id) ?? 0;
  const left = leftByListing.get(id) ?? 0;
  const stock = stocked.get(id);
  if (sold > stock) oversold.push(`${id}: 在庫 ${stock} に対して ${sold} 件売れた`);
  if (left < 0) negativeStock.push(`${id}: 在庫が ${left}`);
  if (sold + left !== stock) inconsistent.push(`${id}: 売れた ${sold} + 残り ${left} ≠ ${stock}`);
}
expect('在庫より多く売れた商品は0件', oversold.length, 0);
for (const line of oversold.slice(0, 5)) console.error(`    ${line}`);
expect('在庫が負になった商品は0件', negativeStock.length, 0);
for (const line of negativeStock.slice(0, 5)) console.error(`    ${line}`);
expect('「売れた数 + 残りの数 = 最初の在庫」でない商品は0件', inconsistent.length, 0);
for (const line of inconsistent.slice(0, 5)) console.error(`    ${line}`);

console.log('\n=== 確かめ5: 買った額と売れた額がつり合っている（受け入れ基準 D1）===');
const { rows: pairRows } = await db.query(
  `SELECT
     COALESCE(-SUM(amount) FILTER (WHERE kind = 'purchase'), 0)::bigint AS paid,
     COALESCE(SUM(amount) FILTER (WHERE kind = 'sale'), 0)::bigint AS received
   FROM mp_ledger_entry
   WHERE organization_id = ANY($1) AND deleted_at IS NULL`,
  [marketIds],
);
expect('払った額と受け取った額が同じ', Number(pairRows[0].paid), Number(pairRows[0].received));

await db.end();

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(
  `\n${COMPANIES}社 / 投げた購入 ${scarceResults.length + overdraftResults.length + bulkResults.length} 件 / ${seconds} 秒`,
);

if (failures.length > 0) {
  console.error(`\n${failures.length} 件が通りませんでした:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('すべて通りました。');
