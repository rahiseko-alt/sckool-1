#!/usr/bin/env node
/**
 * 「既定値は管理者が画面から変更できるようにする」（`docs/requirements.md` 第2部の
 * 前書き）と、テストのボーナス換算表（受け入れ基準 E5）を、動いているサーバーで確かめる。
 *
 * 見るのは3つ。
 *   1. 4つの数字を保存でき、**保存した値が実際の動きを変える**
 *      （はじめに配る資金・ログインを止める回数と時間・相互取引率のしきい値）
 *   2. 壊れた値は保存できない（符号で断られる）
 *   3. テストごとの換算表を変えられ、**変えた表どおりにボーナスが出る**
 *
 * **最後にすべて既定値へ戻す。** 戻さないと、あとから走る他の検査が
 * 100,000 MP や5回のロックを前提にしているために落ちる。
 *
 * 使い方: サーバーを起動しておいて `node scripts/check-settings.mjs`
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

const PASSWORD = 'good-password-1234';
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
let created = 0;

/** 企業を1社作る。返るのは Market ID と初期残高。 */
async function createOrganization(label) {
  created += 1;
  const result = await request('POST', '/store/accounts', {
    body: { password: PASSWORD, organization_name: `SET ${label} ${stamp}-${created}` },
  });
  return { status: result.status, marketId: result.body?.market_id, balance: result.body?.balance };
}

console.log('\n=== 管理者としてログインする ===');
const adminLogin = await request('POST', '/auth/user/emailpass', {
  body: {
    email: process.env.ADMIN_IDENTIFIER ?? 'probe-admin@anon.invalid',
    password: process.env.ADMIN_PASSWORD ?? 'probe-password-1234',
  },
});
expect('管理者としてログインできた', adminLogin.status, 200);
const adminToken = adminLogin.body?.token;

const settingsPath = '/admin/market-settings';
const readSettings = async () => request('GET', settingsPath, { token: adminToken });
const writeSettings = (settings) =>
  request('POST', settingsPath, { body: { settings }, token: adminToken });
const resetSettings = () => request('DELETE', settingsPath, { token: adminToken });

console.log('\n=== 設定の画面は管理者しか開けない ===');
expect('ログインしていなければ断られる', (await request('GET', settingsPath)).status, 401);

const studentSeed = await createOrganization('VIEWER');
const studentLogin = await request('POST', '/auth/customer/emailpass', {
  body: { email: studentSeed.marketId, password: PASSWORD },
});
expect(
  '生徒の合鍵では断られる',
  (await request('GET', settingsPath, { token: studentLogin.body?.token })).status,
  401,
);

console.log('\n=== はじめは既定値（保存が無ければコードの値を使う）===');
await resetSettings();
const initial = await readSettings();
expect('開けた', initial.status, 200);
expect('4つの数字が返る', Object.keys(initial.body?.settings ?? {}).sort(), [
  'initial_funds',
  'login_lock_minutes',
  'login_max_attempts',
  'mutual_trade_threshold',
]);
expect('はじめに配る資金は100,000', initial.body?.settings?.initial_funds, 100_000);
expect('失敗5回で止める', initial.body?.settings?.login_max_attempts, 5);
expect('止めておくのは15分', initial.body?.settings?.login_lock_minutes, 15);
expect('相互取引率のしきい値は30%', initial.body?.settings?.mutual_trade_threshold, 30);
expect('既定値も一緒に返る', initial.body?.defaults?.initial_funds, 100_000);
expect('入れてよい範囲も返る', initial.body?.ranges?.login_max_attempts, { min: 1, max: 100 });
expect('保存されているものは無い', initial.body?.stored, {});

console.log('\n=== 壊れた値は保存できない ===');
const codesOf = (response) => (response.body?.problems ?? []).map((problem) => problem.code);

const zeroFunds = await writeSettings({ initial_funds: 0 });
expect('0円の初期資金は断られる', zeroFunds.status, 400);
expect('理由は範囲の外', codesOf(zeroFunds), ['out_of_range']);
expect('範囲も一緒に返る', zeroFunds.body?.problems?.[0]?.max, 10_000_000);

expect('小数は断られる', codesOf(await writeSettings({ initial_funds: 1.5 })), ['not_an_integer']);
expect('数でないものは断られる', codesOf(await writeSettings({ initial_funds: 'たくさん' })), [
  'not_an_integer',
]);
expect('失敗回数0は断られる', codesOf(await writeSettings({ login_max_attempts: 0 })), [
  'out_of_range',
]);
expect('しきい値101%は断られる', codesOf(await writeSettings({ mutual_trade_threshold: 101 })), [
  'out_of_range',
]);
expect('知らない名前は断られる', codesOf(await writeSettings({ nonsense: 1 })), ['unknown_key']);

const afterRejects = await readSettings();
expect('断られた値は1つも保存されていない', afterRejects.body?.settings?.initial_funds, 100_000);

console.log('\n=== はじめに配る資金を画面から変える（受け入れ基準 B2）===');
const savedFunds = await writeSettings({ initial_funds: 12_345 });
expect('保存できた', savedFunds.status, 200);
expect('返る値も新しい', savedFunds.body?.settings?.initial_funds, 12_345);
expect('保存済みとして返る', savedFunds.body?.stored?.initial_funds, 12_345);

const changedFunds = await createOrganization('FUNDS');
expect('新しい企業の残高が変わった', changedFunds.balance?.total, 12_345);

console.log('\n=== 相互取引率のしきい値を画面から変える（受け入れ基準 H2）===');
await writeSettings({ mutual_trade_threshold: 60 });
const analysis = await request('GET', '/admin/trade-analysis', { token: adminToken });
expect('取引の偏りの画面が新しいしきい値を使う', analysis.body?.threshold, 60);
const overridden = await request('GET', '/admin/trade-analysis?threshold=45', {
  token: adminToken,
});
expect('URL に書けばその場だけ別の値も見られる', overridden.body?.threshold, 45);

console.log('\n=== ログインを止める決まりを画面から変える（受け入れ基準 A6）===');
await writeSettings({ login_max_attempts: 2, login_lock_minutes: 1 });

const locked = await createOrganization('LOCK');
const tryLogin = (marketId, password) =>
  request('POST', '/auth/customer/emailpass', { body: { email: marketId, password } });

expect('1回目の失敗は401', (await tryLogin(locked.marketId, 'wrong-password')).status, 401);
expect('2回目の失敗も401', (await tryLogin(locked.marketId, 'wrong-password')).status, 401);
const thirdTry = await tryLogin(locked.marketId, 'wrong-password');
expect('3回目からは止まる（既定の5回ではなく2回）', thirdTry.status, 429);
expect('止まる長さも変わった', thirdTry.body?.retry_after_minutes, 1);
expect(
  '止まっている間は正しいパスワードでも入れない',
  (await tryLogin(locked.marketId, PASSWORD)).status,
  429,
);

console.log('\n=== すべて既定値に戻せる ===');
const reset = await resetSettings();
expect('戻せた', reset.status, 200);
expect('はじめに配る資金が戻った', reset.body?.settings?.initial_funds, 100_000);
expect('失敗回数が戻った', reset.body?.settings?.login_max_attempts, 5);
expect('しきい値が戻った', reset.body?.settings?.mutual_trade_threshold, 30);
expect('保存されているものが消えた', reset.body?.stored, {});

const backToDefault = await createOrganization('BACK');
expect('新しい企業の残高も戻った', backToDefault.balance?.total, 100_000);
expect(
  '取引の偏りのしきい値も戻った',
  (await request('GET', '/admin/trade-analysis', { token: adminToken })).body?.threshold,
  30,
);

console.log('\n=== テストの一覧を見られる（受け入れ基準 E5）===');
expect('ログインしていなければ断られる', (await request('GET', '/admin/quizzes')).status, 401);

const quizList = await request('GET', '/admin/quizzes', { token: adminToken });
expect('開けた', quizList.status, 200);
const quiz = (quizList.body?.quizzes ?? [])[0];
expect('テストが1つ以上ある', typeof quiz?.id, 'string');
expect('換算表が入っている', Array.isArray(quiz?.reward_tiers), true);
expect('問題文と正解は返さない', JSON.stringify(quiz ?? {}).includes('correctIndex'), false);

const originalTiers = quiz?.reward_tiers;
const originalDays = quiz?.bonus_valid_days;

console.log('\n=== 壊れた換算表は保存できない ===');
const saveTiers = (tiers) =>
  request('POST', `/admin/quizzes/${quiz.id}`, {
    body: { reward_tiers: tiers },
    token: adminToken,
  });

expect('空の表は断られる', codesOf(await saveTiers([])), ['empty']);
expect('配列でないものは断られる', codesOf(await saveTiers({ minScore: 0 })), ['not_a_list']);
expect('0点の行が無い表は断られる', codesOf(await saveTiers([{ minScore: 60, amount: 500 }])), [
  'missing_zero',
]);
expect(
  '得点が範囲の外なら断られる',
  codesOf(
    await saveTiers([
      { minScore: 0, amount: 0 },
      { minScore: 101, amount: 100 },
    ]),
  ),
  ['score_out_of_range'],
);
expect('額が負なら断られる', codesOf(await saveTiers([{ minScore: 0, amount: -1 }])), [
  'amount_negative',
]);
expect(
  '同じ得点が2回ある表は断られる',
  codesOf(
    await saveTiers([
      { minScore: 0, amount: 0 },
      { minScore: 60, amount: 500 },
      { minScore: 60, amount: 800 },
    ]),
  ),
  ['duplicate_score'],
);
expect(
  '点が高いほうが少ない表は断られる',
  codesOf(
    await saveTiers([
      { minScore: 0, amount: 0 },
      { minScore: 60, amount: 1_000 },
      { minScore: 90, amount: 500 },
    ]),
  ),
  ['not_monotonic'],
);
expect(
  '使える日数0は断られる',
  (
    await request('POST', `/admin/quizzes/${quiz.id}`, {
      body: { bonus_valid_days: 0 },
      token: adminToken,
    })
  ).body?.code,
  'invalid_bonus_valid_days',
);
expect(
  '断られた表は保存されていない',
  (await request('GET', '/admin/quizzes', { token: adminToken })).body?.quizzes?.[0]?.reward_tiers,
  originalTiers,
);

console.log('\n=== 換算表を変えると、配る額が変わる（受け入れ基準 E5）===');
// どの点でも同じ額が出る表にする。正解を知らなくても額の変化を確かめられる。
const flatTiers = [{ minScore: 0, amount: 2_345 }];
const savedTiers = await saveTiers(flatTiers);
expect('保存できた', savedTiers.status, 200);
// JSON を通ると項目の並びが変わるので、数の組にそろえてから比べる。
const asPairs = (tiers) => (tiers ?? []).map((tier) => [tier.minScore, tier.amount]);
expect('返る表も新しい', asPairs(savedTiers.body?.quiz?.reward_tiers), asPairs(flatTiers));

const taker = await createOrganization('QUIZ');
const takerLogin = await request('POST', '/auth/customer/emailpass', {
  body: { email: taker.marketId, password: PASSWORD },
});
const submitted = await request('POST', `/store/quizzes/${quiz.id}/submit`, {
  body: { answers: {} },
  token: takerLogin.body?.token,
});
expect('答案を出せた', submitted.status, 200);
expect('0点でも新しい表のとおりに配られた', submitted.body?.reward_amount, 2_345);

console.log('\n=== 使える日数も変えられる ===');
const savedDays = await request('POST', `/admin/quizzes/${quiz.id}`, {
  body: { bonus_valid_days: 3 },
  token: adminToken,
});
expect('保存できた', savedDays.body?.quiz?.bonus_valid_days, 3);

console.log('\n=== 後始末: テストの設定を元に戻す ===');
const restored = await request('POST', `/admin/quizzes/${quiz.id}`, {
  body: { reward_tiers: originalTiers, bonus_valid_days: originalDays },
  token: adminToken,
});
expect('換算表を戻せた', restored.body?.quiz?.reward_tiers, originalTiers);
expect('使える日数を戻せた', restored.body?.quiz?.bonus_valid_days, originalDays);

const finalSettings = await resetSettings();
expect('数字も既定値に戻っている', finalSettings.body?.settings, {
  initial_funds: 100_000,
  login_max_attempts: 5,
  login_lock_minutes: 15,
  mutual_trade_threshold: 30,
});

console.log('\n=== まとめ ===');
if (failures.length > 0) {
  console.error(`${failures.length}件が通りませんでした:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('全て通りました。');
