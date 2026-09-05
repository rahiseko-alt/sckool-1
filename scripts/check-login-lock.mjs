#!/usr/bin/env node
/**
 * ログインの失敗が続いたときに止まるかを、動いているサーバーで確かめる
 * （受け入れ基準 A6）。
 *
 * 単体テストは数え方だけを見ている。ここが見るのは
 * **認証の経路そのものに掛かっているか**。別の経路で数えても、
 * 標準の経路が開いていれば素通りできるため、実際に叩いて確かめる。
 *
 * 使い方: サーバーを起動しておいて `node scripts/check-login-lock.mjs`
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

async function post(path, body) {
  const response = await fetch(new URL(path, BASE), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-publishable-api-key': publishableKey },
    body: JSON.stringify(body),
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

console.log('\n=== 準備: アカウントを1つ作る ===');
const created = await post('/store/accounts', {
  password,
  organization_name: `LOCK CHECK ${Date.now()}`,
});
expect('作れた', created.status, 201);
const marketId = created.body?.market_id;

console.log('\n=== 4回続けて失敗しても止まらない ===');
const firstFour = [];
for (let i = 0; i < 4; i += 1) {
  firstFour.push(
    (await post('/auth/customer/emailpass', { email: marketId, password: `no${i}` })).status,
  );
}
expect('4回とも401', firstFour, [401, 401, 401, 401]);

console.log('\n=== 正しいパスワードなら入れる（数えが0に戻る）===');
expect(
  '入れた',
  (await post('/auth/customer/emailpass', { email: marketId, password })).status,
  200,
);

console.log('\n=== 成功のあとは、また4回まで失敗できる ===');
const nextFour = [];
for (let i = 0; i < 4; i += 1) {
  nextFour.push(
    (await post('/auth/customer/emailpass', { email: marketId, password: `no${i}` })).status,
  );
}
expect('4回とも401', nextFour, [401, 401, 401, 401]);

console.log('\n=== 5回目の失敗のあとは止まる ===');
expect(
  '5回目は401',
  (await post('/auth/customer/emailpass', { email: marketId, password: 'noX' })).status,
  401,
);
const locked = await post('/auth/customer/emailpass', { email: marketId, password });
expect('正しいパスワードでも断られる', locked.status, 429);
expect('あと何分かを伝える', typeof locked.body?.retry_after_minutes === 'number', true);

console.log('\n=== 別の企業は巻き添えにならない ===');
const other = await post('/store/accounts', {
  password,
  organization_name: `LOCK OTHER ${Date.now()}`,
});
expect(
  '別の企業は入れる',
  (await post('/auth/customer/emailpass', { email: other.body?.market_id, password })).status,
  200,
);

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length} 件が通りませんでした:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('すべて通りました。');
