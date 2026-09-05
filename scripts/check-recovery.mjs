#!/usr/bin/env node
/**
 * Recovery Code でパスワードを作り直せるかを、動いているサーバーで確かめる
 * （受け入れ基準 A4、要件36）。
 *
 * 使い方: サーバーを起動しておいて `node scripts/check-recovery.mjs`
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

const firstPassword = 'good-password-1234';
const secondPassword = 'new-password-9999';
const thirdPassword = 'third-password-777';

console.log('\n=== 準備: アカウントを1つ作る ===');
const created = await post('/store/accounts', {
  password: firstPassword,
  organization_name: `RECOVERY ${Date.now()}`,
});
expect('作れた', created.status, 201);
const marketId = created.body?.market_id;
const firstCode = created.body?.recovery_code;

console.log('\n=== 短い新パスワードは断る（受け入れ基準 A6）===');
expect(
  '断られた',
  (
    await post('/store/recovery', {
      market_id: marketId,
      recovery_code: firstCode,
      new_password: 'abc',
    })
  ).status,
  400,
);

console.log('\n=== 違う Recovery Code は断る ===');
expect(
  '断られた',
  (
    await post('/store/recovery', {
      market_id: marketId,
      recovery_code: 'AAAA-BBBB-CCCC',
      new_password: secondPassword,
    })
  ).status,
  401,
);

console.log('\n=== 正しい Recovery Code で作り直せる（同 A4）===');
const reset = await post('/store/recovery', {
  market_id: marketId,
  recovery_code: firstCode,
  new_password: secondPassword,
});
expect('作り直せた', reset.status, 200);
const secondCode = reset.body?.recovery_code;
expect(
  '新しいコードが1回だけ出た',
  typeof secondCode === 'string' && secondCode !== firstCode,
  true,
);

console.log('\n=== 新しいパスワードで入れ、古いパスワードでは入れない ===');
expect(
  '新しいほうで入れた',
  (await post('/auth/customer/emailpass', { email: marketId, password: secondPassword })).status,
  200,
);
expect(
  '古いほうは断られた',
  (await post('/auth/customer/emailpass', { email: marketId, password: firstPassword })).status,
  401,
);

console.log('\n=== 使った Recovery Code は二度と使えない（同 A4）===');
expect(
  '再利用は断られた',
  (
    await post('/store/recovery', {
      market_id: marketId,
      recovery_code: firstCode,
      new_password: thirdPassword,
    })
  ).status,
  401,
);

console.log('\n=== 新しく出たコードは使える ===');
expect(
  '使えた',
  (
    await post('/store/recovery', {
      market_id: marketId,
      recovery_code: secondCode,
      new_password: thirdPassword,
    })
  ).status,
  200,
);

console.log('\n=== 管理者がパスワードを初期化できる（受け入れ基準 A5）===');
async function postAs(path, body, token) {
  const headers = { 'content-type': 'application/json', 'x-publishable-api-key': publishableKey };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(new URL(path, BASE), {
    method: 'POST',
    headers,
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

expect(
  '管理者でなければ断られる',
  (await postAs('/admin/accounts/reset-password', { market_id: marketId })).status,
  401,
);

const adminLogin = await post('/auth/user/emailpass', {
  email: process.env.ADMIN_IDENTIFIER ?? 'probe-admin@anon.invalid',
  password: process.env.ADMIN_PASSWORD ?? 'probe-password-1234',
});
expect('管理者としてログインできた', adminLogin.status, 200);
const adminToken = adminLogin.body?.token;

expect(
  '存在しない Market ID は404',
  (await postAs('/admin/accounts/reset-password', { market_id: 'MKT-ZZZZ-ZZZZ' }, adminToken))
    .status,
  404,
);

const resetByAdmin = await postAs(
  '/admin/accounts/reset-password',
  { market_id: marketId },
  adminToken,
);
expect('初期化できた', resetByAdmin.status, 200);
expect('一時パスワードが出た', typeof resetByAdmin.body?.temporary_password === 'string', true);
expect(
  '一時パスワードで入れる',
  (
    await post('/auth/customer/emailpass', {
      email: marketId,
      password: resetByAdmin.body?.temporary_password,
    })
  ).status,
  200,
);
expect(
  '初期化前のパスワードは断られる',
  (await post('/auth/customer/emailpass', { email: marketId, password: thirdPassword })).status,
  401,
);

console.log('\n=== 保存されているのはハッシュだけ（同 A1）===');
const stored = await client.query(
  `SELECT count(*)::int AS hits FROM auth_identity
   WHERE app_metadata::text LIKE $1 OR app_metadata::text LIKE $2`,
  [`%${firstCode}%`, `%${secondCode}%`],
);
expect('平文はどこにも無い', stored.rows[0].hits, 0);

await client.end();

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length} 件が通りませんでした:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('すべて通りました。');
