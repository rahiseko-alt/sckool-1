#!/usr/bin/env node
/**
 * テストの中身の多言語化が受け入れ基準どおりかを、動いているサーバーで確かめる
 * （T045、受け入れ基準 I3・E4）。
 *
 * 使い方: サーバーを起動しておいて `node scripts/check-quiz-i18n.mjs`
 *
 * 確かめること:
 *   - 先生が訳を入れられ、保存できる
 *   - 生徒がその言語に切り替えると訳が出る／訳の無い言語では原文が出る
 *   - 選択肢の数を原文と変えた訳は断られる（正解の位置がずれるため）
 *   - どの言語で取っても応答に正解（correctIndex）が出ない
 *   - 訳のある言語と原文の言語で、同じ答案なら同じ得点（言語非依存）
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
await client.end();
if (!publishableKey) {
  console.error('公開鍵がありません。先に seed-market を実行してください。');
  process.exit(1);
}

const ADMIN_EMAIL = process.env.ADMIN_IDENTIFIER ?? 'probe-admin@anon.invalid';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'probe-password-1234';

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
  return { status: response.status, body: parsed, raw: text };
}

async function loginCustomer(marketId) {
  const r = await request('POST', '/auth/customer/emailpass', {
    email: marketId,
    password: 'good-password-1234',
  });
  return r.body?.token;
}

async function makeOrg(label) {
  const a = await request('POST', '/store/accounts', {
    password: 'good-password-1234',
    organization_name: `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  return loginCustomer(a.body?.market_id);
}

console.log('\n=== 準備: 先生としてログインし、テストを1つ選ぶ ===');
const adminLogin = await request('POST', '/auth/user/emailpass', {
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
});
expect('先生でログインできた', adminLogin.status, 200);
const adminToken = adminLogin.body?.token;

const adminList = await request('GET', '/admin/quizzes', undefined, adminToken);
expect('先生の一覧を取れた', adminList.status, 200);
const quiz = (adminList.body?.quizzes ?? [])[0];
expect('テストが1つ以上ある', Boolean(quiz), true);
expect('先生の一覧に原文の設問がある', Array.isArray(quiz?.questions), true);
expect(
  '先生の一覧にも正解は含まれない',
  JSON.stringify(quiz ?? {}).includes('correctIndex'),
  false,
);

const quizId = quiz.id;

console.log('\n=== 先生が英語の訳を入れて保存できる（受け入れ基準 I3）===');
const enTranslation = [
  {
    locale_code: 'en',
    title: 'Knowledge Challenge (EN)',
    topic: 'Antitrust law (EN)',
    questions: quiz.questions.map((q) => ({
      id: q.id,
      prompt: `EN prompt for ${q.id}`,
      choices: q.choices.map((_, i) => `EN choice ${i}`),
    })),
  },
];
const save = await request(
  'POST',
  `/admin/quizzes/${quizId}`,
  { translations: enTranslation },
  adminToken,
);
expect('保存できた', save.status, 200);
expect(
  '保存した言語が返る',
  save.body?.quiz?.translations?.some((t) => t.locale_code === 'en'),
  true,
);

console.log('\n=== 選択肢の数を原文と変えた訳は断られる（正解の位置がずれるため）===');
const badTranslation = [
  {
    locale_code: 'en',
    questions: [{ id: quiz.questions[0].id, prompt: 'x', choices: ['only one'] }],
  },
];
const bad = await request(
  'POST',
  `/admin/quizzes/${quizId}`,
  { translations: badTranslation },
  adminToken,
);
expect('断られた', bad.status, 400);
expect('理由は選択肢の数の不一致', bad.body?.code, 'invalid_translations');
expect(
  '不一致の設問が示される',
  bad.body?.problems?.some((p) => p.code === 'choices_count_mismatch'),
  true,
);

console.log('\n=== 生徒が英語に切り替えると訳が出る（受け入れ基準 I3）===');
const en = await request('GET', `/store/quizzes/${quizId}?locale=en`);
expect('英語の題名が出る', en.body?.quiz?.title, 'Knowledge Challenge (EN)');
expect('英語の題材が出る', en.body?.quiz?.topic, 'Antitrust law (EN)');
expect(
  '英語の設問文が出る',
  en.body?.quiz?.questions?.[0]?.prompt,
  `EN prompt for ${quiz.questions[0].id}`,
);
expect('英語の応答に正解は無い（受け入れ基準 E4）', en.raw.includes('correctIndex'), false);

console.log('\n=== 訳の無い言語（タイ語）では原文が出る（受け入れ基準 I3）===');
const th = await request('GET', `/store/quizzes/${quizId}?locale=th-TH`);
expect(
  'タイ語ではないこと＝英語の訳が出ていない',
  th.body?.quiz?.title === 'Knowledge Challenge (EN)',
  false,
);
expect('タイ語の応答にも正解は無い', th.raw.includes('correctIndex'), false);

console.log('\n=== 得点は言語非依存（訳あり en と 訳なし th で同じ答案 → 同じ得点）===');
const detailEn = await request('GET', `/store/quizzes/${quizId}?locale=en`);
const detailTh = await request('GET', `/store/quizzes/${quizId}?locale=th-TH`);
const idsEn = detailEn.body.quiz.questions.map((q) => q.id);
const idsTh = detailTh.body.quiz.questions.map((q) => q.id);
expect('設問の並びが両言語で同じ', idsEn, idsTh);
const answers = Object.fromEntries(idsEn.map((id) => [id, 0])); // 全部位置0
const tokenEn = await makeOrg('QZI18N-EN');
const tokenTh = await makeOrg('QZI18N-TH');
const subEn = await request('POST', `/store/quizzes/${quizId}/submit`, { answers }, tokenEn);
const subTh = await request('POST', `/store/quizzes/${quizId}/submit`, { answers }, tokenTh);
expect('en で採点できた', subEn.status, 200);
expect('th で採点できた', subTh.status, 200);
expect('得点が言語で変わらない', subEn.body?.score, subTh.body?.score);

console.log('\n=== 後片付け: 入れた訳を消して元に戻す ===');
const cleanup = await request('POST', `/admin/quizzes/${quizId}`, { translations: [] }, adminToken);
expect('訳を空に戻せた', cleanup.status, 200);

console.log('\n=== まとめ ===');
if (failures.length > 0) {
  console.error(`\n${failures.length} 件が通りませんでした:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('すべて通りました。');
