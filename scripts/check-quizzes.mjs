#!/usr/bin/env node
/**
 * テストと期限つきボーナスが受け入れ基準どおりかを、動いているサーバーで確かめる
 * （受け入れ基準 E1〜E6、要件32・42）。
 *
 * 使い方: サーバーを起動しておいて `node scripts/check-quizzes.mjs`
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
  return { status: response.status, body: parsed, raw: text };
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
  organization_name: `QUIZ ${Date.now()}`,
});
expect('作れた', account.status, 201);
const marketId = account.body?.market_id;
currentToken = await login(marketId);
expect('合鍵を受け取った', typeof currentToken, 'string');

console.log('\n=== 受けられるテストが一覧に出る（要件42）===');
const list = await request('GET', '/store/quizzes');
expect('一覧を取れた', list.status, 200);
const quizSummary = (list.body?.quizzes ?? [])[0];
expect('テストが1つ以上ある', Boolean(quizSummary), true);
expect('受ける前に問題数が分かる', typeof quizSummary?.question_count, 'number');
expect('受ける前に最高額が分かる', quizSummary?.max_reward, 1_500);

console.log('\n=== 問題の応答に正解が含まれない（受け入れ基準 E4）===');
const detail = await request('GET', `/store/quizzes/${quizSummary.id}`);
expect('問題を取れた', detail.status, 200);
expect('correctIndex が出ていない', detail.raw.includes('correctIndex'), false);
expect('correct_index も出ていない', detail.raw.includes('correct_index'), false);
const questions = detail.body?.quiz?.questions ?? [];
expect('選択肢は出ている', Array.isArray(questions[0]?.choices), true);
expect(
  'どの問題にも正解の印が無い',
  questions.every((question) => Object.keys(question).sort().join(',') === 'choices,id,prompt'),
  true,
);

console.log('\n=== データベースの正解を読み、満点の答案を作る ===');
const quizRow = await client.query('SELECT questions FROM quiz WHERE id = $1', [quizSummary.id]);
const stored = quizRow.rows[0]?.questions ?? [];
const perfectAnswers = Object.fromEntries(stored.map((q) => [q.id, q.correctIndex]));
const wrongAnswers = Object.fromEntries(stored.map((q) => [q.id, (q.correctIndex + 1) % 4]));

console.log('\n=== 満点ならボーナスが出る（同 E5、要件32）===');
const perfect = await request('POST', `/store/quizzes/${quizSummary.id}/submit`, {
  answers: perfectAnswers,
});
expect('採点された', perfect.status, 200);
expect('100点', perfect.body?.score, 100);
expect('1,500MP', perfect.body?.reward_amount, 1_500);
expect('ボーナス残高に入った', perfect.body?.balance?.bonus, 1_500);
expect('通常残高は変わらない', perfect.body?.balance?.normal, 100_000);

console.log('\n=== ボーナスには期限がある（同 E2）===');
expect('期限が返る', typeof perfect.body?.bonus_expires_at, 'string');
const expiresAt = new Date(perfect.body?.bonus_expires_at);
const days = Math.round((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
expect('7日後', days, 7);

console.log('\n=== 同じテストからは2回もらえない（同 E3）===');
const second = await request('POST', `/store/quizzes/${quizSummary.id}/submit`, {
  answers: perfectAnswers,
});
expect('受験はできる', second.status, 200);
expect('点は出る', second.body?.score, 100);
expect('ボーナスは0', second.body?.reward_amount, 0);
expect('すでにもらったと分かる', second.body?.already_rewarded, true);
expect('残高は増えていない', second.body?.balance?.bonus, 1_500);

console.log('\n=== 支払いはボーナスから先に使われる（同 E1）===');
const sellerAccount = await request('POST', '/store/accounts', {
  password: 'good-password-1234',
  organization_name: `QUIZ SELLER ${Date.now()}`,
});
const sellerToken = await login(sellerAccount.body?.market_id);
const listing = await request(
  'POST',
  '/store/listings',
  {
    title: `テスト用商品 ${Date.now()}`,
    description: '説明',
    target_customer: 'ターゲット',
    problem_solved: '課題',
    price: 2_000,
    available_quantity: 1,
    image_url: 'https://example.com/a.png',
    sale_starts_at: '2026-01-01T00:00:00Z',
    sale_ends_at: '2099-12-31T00:00:00Z',
  },
  sellerToken,
);
const bought = await request('POST', '/store/purchases', {
  listing_id: listing.body?.listing?.id,
});
expect('買えた', bought.status, 201);
// 要件32の例: 通常10,000／ボーナス1,500で2,000の購入 → ボーナス0／通常9,500
// ここは通常100,000／ボーナス1,500なので、ボーナス0／通常99,500になる。
expect('ボーナスから先に減った', bought.body?.balance?.bonus, 0);
expect('残りは通常から減った', bought.body?.balance?.normal, 99_500);

console.log('\n=== 受け取りは通常残高に入る（同 E6）===');
const sellerView = await request('GET', '/store/transactions', undefined, sellerToken);
expect('売った側の通常残高が増えた', sellerView.body?.balance?.normal, 102_000);
expect('売った側にボーナスは入らない', sellerView.body?.balance?.bonus, 0);

console.log('\n=== 点が低いとボーナスは出ない（同 E5）===');
const other = await request('POST', '/store/accounts', {
  password: 'good-password-1234',
  organization_name: `QUIZ LOW ${Date.now()}`,
});
const low = await request(
  'POST',
  `/store/quizzes/${quizSummary.id}/submit`,
  { answers: wrongAnswers },
  await login(other.body?.market_id),
);
expect('0点', low.body?.score, 0);
expect('ボーナスは0', low.body?.reward_amount, 0);

console.log('\n=== ログインしていないと答案を出せない（受け入れ基準 E4 の前提）===');
// 出せてしまうと、他社を名乗ってボーナスを消費させられる。
expect(
  'ログインしていなければ断られる',
  (
    await request(
      'POST',
      `/store/quizzes/${quizSummary.id}/submit`,
      { market_id: marketId, answers: perfectAnswers },
      null,
    )
  ).status,
  401,
);

console.log('\n=== 無いテストは404 ===');
expect('404が返る', (await request('GET', '/store/quizzes/qz_nothing')).status, 404);

await client.end();

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length} 件が通りませんでした:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('すべて通りました。');
