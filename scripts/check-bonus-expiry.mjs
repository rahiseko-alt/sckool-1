#!/usr/bin/env node
/**
 * ボーナスの期限切れが受け入れ基準どおりかを、動いているサーバーで確かめる
 * （受け入れ基準 E2「期限切れは使えず、履歴に『失効』の行が残る」と
 *   B3「残高＝取引履歴の合計」）。
 *
 * 見るのは4つ。
 *   1. 期限が切れたボーナスに「失効」の行が入り、残高と履歴の合計が一致する
 *   2. 失効の行が二度入らない
 *   3. 期限が切れていないボーナスは失効しない
 *   4. 定期実行が本当に動く（誰も押さなくても失効の行が入る）
 *
 * 4 は `MP_BONUS_EXPIRY_CRON` を毎分にしてサーバーを起動しておく必要がある。
 * 既定の毎時0分のままだと1時間待つことになるため。
 *
 * 使い方:
 *   MP_BONUS_EXPIRY_CRON="* * * * *" node scripts/with-api.mjs \
 *     node scripts/check-bonus-expiry.mjs
 */

import { Client } from 'pg';

const BASE = process.env.API_BASE_URL ?? 'http://localhost:9000';
const connectionString =
  process.env.DATABASE_URL ?? 'postgres://medusa:medusa@localhost:5432/sckool';

/** 定期実行を待つ上限。毎分の設定なら1分以内に来る。 */
const JOB_WAIT_MS = Number(process.env.EXPIRY_JOB_WAIT_MS ?? 150_000);

const client = new Client({ connectionString });
await client.connect();
const { rows: keyRows } = await client.query(
  `SELECT token FROM api_key WHERE type = 'publishable' AND revoked_at IS NULL
   ORDER BY created_at DESC LIMIT 1`,
);
const publishableKey = keyRows[0]?.token;
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

const PASSWORD = 'good-password-1234';

/** 企業として行う操作には合鍵が要る（docs/decisions.md「37.」）。 */
async function login(marketId) {
  const result = await request('POST', '/auth/customer/emailpass', {
    body: { email: marketId, password: PASSWORD },
  });
  return result.body?.token;
}

async function createOrganization(label) {
  const created = await request('POST', '/store/accounts', {
    body: {
      password: PASSWORD,
      organization_name: `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    },
  });
  const marketId = created.body?.market_id;
  return { marketId, token: await login(marketId) };
}

/** データベースから見た、その企業の取引履歴の合計。 */
async function historyTotalOf(marketId) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(amount), 0)::bigint AS total
       FROM mp_ledger_entry
      WHERE organization_id = $1 AND deleted_at IS NULL`,
    [marketId],
  );
  return Number(rows[0].total);
}

/** その企業に入っている「失効」の行。 */
async function expiredRowsOf(marketId) {
  const { rows } = await client.query(
    `SELECT amount::bigint AS amount, reference
       FROM mp_ledger_entry
      WHERE organization_id = $1 AND kind = 'bonus_expired' AND deleted_at IS NULL
      ORDER BY created_at`,
    [marketId],
  );
  return rows.map((row) => ({ amount: Number(row.amount), reference: row.reference }));
}

/** テストのボーナスを配った行（期限を過去にずらすときの対象）。 */
async function bonusGrantOf(marketId) {
  const { rows } = await client.query(
    `SELECT id, amount::bigint AS amount FROM mp_ledger_entry
      WHERE organization_id = $1 AND kind = 'bonus_grant' AND deleted_at IS NULL
      ORDER BY created_at LIMIT 1`,
    [marketId],
  );
  return rows[0] ? { id: rows[0].id, amount: Number(rows[0].amount) } : undefined;
}

/**
 * 「7日たった」状態を作る。
 *
 * 本当に7日待つわけにいかないので、配った行の期限だけを過去にずらす。
 * ずらすのは期限の列だけで、金額にも種類にも触らない。
 */
async function makeBonusExpired(marketId) {
  await client.query(
    `UPDATE mp_ledger_entry SET expires_at = now() - interval '1 day'
      WHERE organization_id = $1 AND kind = 'bonus_grant' AND deleted_at IS NULL`,
    [marketId],
  );
}

async function balanceOf(token) {
  const result = await request('GET', '/store/transactions', { token });
  return result.body;
}

console.log('\n=== 準備: 満点のテストでボーナスをもらう ===');
const quizzes = await request('GET', '/store/quizzes');
const quizId = (quizzes.body?.quizzes ?? [])[0]?.id;
expect('テストがある', typeof quizId, 'string');

const { rows: quizRows } = await client.query('SELECT questions FROM quiz WHERE id = $1', [quizId]);
const perfectAnswers = Object.fromEntries(
  (quizRows[0]?.questions ?? []).map((question) => [question.id, question.correctIndex]),
);

/** 満点を取ってボーナスをもらう企業を作る。 */
async function createOrganizationWithBonus(label) {
  const organization = await createOrganization(label);
  const submitted = await request('POST', `/store/quizzes/${quizId}/submit`, {
    body: { answers: perfectAnswers },
    token: organization.token,
  });
  return { ...organization, reward: submitted.body?.reward_amount };
}

// 使い残しが出るように、ボーナスの一部だけを使う企業を作る。
const seller = await createOrganization('EXPIRY SELLER');
const spender = await createOrganizationWithBonus('EXPIRY SPENDER');
expect('ボーナスを1,500もらえた', spender.reward, 1_500);

const listing = await request('POST', '/store/listings', {
  body: {
    title: `失効の検査用 ${Math.random().toString(36).slice(2, 8)}`,
    description: '説明',
    target_customer: 'ターゲット',
    problem_solved: '課題',
    price: 500,
    available_quantity: 5,
    image_url: 'https://example.com/a.png',
    sale_starts_at: '2026-01-01T00:00:00Z',
    sale_ends_at: '2099-12-31T00:00:00Z',
  },
  token: seller.token,
});
expect('500MPの商品を出せた', listing.status, 201);

const bought = await request('POST', '/store/purchases', {
  body: { listing_id: listing.body?.listing?.id },
  token: spender.token,
});
expect('ボーナスから500だけ使った', bought.body?.balance?.bonus, 1_000);
expect('通常残高は減っていない', bought.body?.balance?.normal, 100_000);

console.log('\n=== 期限が切れる前は、残高と履歴の合計がそろっている ===');
// 通常100,000 ＋ ボーナスの残り1,000（1,500 のうち 500 を使った）
const before = await balanceOf(spender.token);
expect('残高の合計', before?.balance?.total, 101_000);
expect('履歴の合計と一致する', await historyTotalOf(spender.marketId), before?.balance?.total);

console.log('\n=== 管理者以外は失効を走らせられない ===');
expect(
  'ログインしていなければ断られる',
  (await request('POST', '/admin/bonus-expiry')).status,
  401,
);
expect(
  '生徒の合鍵では断られる',
  (await request('POST', '/admin/bonus-expiry', { token: spender.token })).status,
  401,
);

const adminLogin = await request('POST', '/auth/user/emailpass', {
  body: {
    email: process.env.ADMIN_IDENTIFIER ?? 'probe-admin@anon.invalid',
    password: process.env.ADMIN_PASSWORD ?? 'probe-password-1234',
  },
});
expect('管理者としてログインできた', adminLogin.status, 200);
const adminToken = adminLogin.body?.token;

console.log('\n=== 1. 期限が切れると「失効」の行が入り、残高と履歴の合計が一致する ===');
const grant = await bonusGrantOf(spender.marketId);
expect('配った行がある', grant?.amount, 1_500);
await makeBonusExpired(spender.marketId);

const swept = await request('POST', '/admin/bonus-expiry', { token: adminToken });
expect('失効の処理を走らせられた', swept.status, 200);

const expiredRows = await expiredRowsOf(spender.marketId);
expect('失効の行が1件だけ入った', expiredRows.length, 1);
// 1,500 のうち 500 は使ってしまっている。消えるのは使い残しの 1,000 だけ。
expect('使い残しの1,000だけが失効した', expiredRows[0]?.amount, -1_000);
expect('どの配布が失効したか分かる', expiredRows[0]?.reference, grant?.id);

const after = await balanceOf(spender.token);
expect('ボーナス残高は0になった', after?.balance?.bonus, 0);
expect('通常残高は減っていない', after?.balance?.normal, 100_000);
expect('残高の合計', after?.balance?.total, 100_000);
expect('履歴の合計と一致する（受け入れ基準 B3）', await historyTotalOf(spender.marketId), 100_000);

const kinds = (after?.transactions ?? []).map((row) => row.kind);
expect('履歴に失効の行が残る（受け入れ基準 E2）', kinds.includes('bonus_expired'), true);

// 管理者の画面にも同じ勘定が出る。ここが false だと「どこかで片側だけの行を
// 書いている」ことになり、失効のせいで毎回赤くなってしまう。
const overview = await request('GET', '/admin/organizations', { token: adminToken });
expect('管理者の一覧を開けた', overview.status, 200);
expect('説明できない差が無い（受け入れ基準 B3）', overview.body?.supply?.matches, true);

console.log('\n=== 2. 失効の行は二度入らない ===');
const again = await request('POST', '/admin/bonus-expiry', { token: adminToken });
expect('もう一度走らせられた', again.status, 200);
const afterTwice = await expiredRowsOf(spender.marketId);
expect('失効の行は1件のまま', afterTwice.length, 1);
const balanceTwice = await balanceOf(spender.token);
expect('残高も変わらない', balanceTwice?.balance?.total, 100_000);
expect('履歴の合計も変わらない', await historyTotalOf(spender.marketId), 100_000);

console.log('\n=== 3. 期限が切れていないボーナスは失効しない ===');
const keeper = await createOrganizationWithBonus('EXPIRY KEEPER');
expect('ボーナスを1,500もらえた', keeper.reward, 1_500);
const sweptAgain = await request('POST', '/admin/bonus-expiry', { token: adminToken });
expect('失効の処理を走らせられた', sweptAgain.status, 200);
expect('失効の行は作られない', (await expiredRowsOf(keeper.marketId)).length, 0);
const keeperBalance = await balanceOf(keeper.token);
expect('ボーナスは残っている', keeperBalance?.balance?.bonus, 1_500);
expect('残高の合計', keeperBalance?.balance?.total, 101_500);
expect('履歴の合計と一致する', await historyTotalOf(keeper.marketId), 101_500);

console.log('\n=== 4. 定期実行が本当に動く（誰も押さなくても失効する）===');
const cron = process.env.MP_BONUS_EXPIRY_CRON;
if (!cron) {
  console.error(
    '  確かめられません: MP_BONUS_EXPIRY_CRON を毎分（"* * * * *"）にしてサーバーを起動してください。',
  );
  failures.push('定期実行を確かめられなかった（MP_BONUS_EXPIRY_CRON が未設定）');
} else {
  console.log(`  定期実行の設定: ${cron}（この設定でサーバーが動いている前提）`);
  const waiter = await createOrganizationWithBonus('EXPIRY JOB');
  expect('ボーナスを1,500もらえた', waiter.reward, 1_500);
  await makeBonusExpired(waiter.marketId);

  const deadline = Date.now() + JOB_WAIT_MS;
  let rows = [];
  while (Date.now() < deadline) {
    rows = await expiredRowsOf(waiter.marketId);
    if (rows.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  expect('誰も押していないのに失効の行が入った', rows.length, 1);
  expect('金額は配った1,500の全額', rows[0]?.amount, -1_500);

  const waiterBalance = await balanceOf(waiter.token);
  expect('ボーナス残高は0', waiterBalance?.balance?.bonus, 0);
  expect('残高の合計', waiterBalance?.balance?.total, 100_000);
  expect('履歴の合計と一致する', await historyTotalOf(waiter.marketId), 100_000);
}

await client.end();

console.log('\n=== まとめ ===');
if (failures.length > 0) {
  console.error(`${failures.length}件が通りませんでした:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('全て通りました。');
