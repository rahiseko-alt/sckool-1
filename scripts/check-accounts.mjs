#!/usr/bin/env node
/**
 * 匿名アカウントの作成が受け入れ基準どおりかを、動いているサーバーに対して確かめる。
 *
 * 見るのは A1（一度だけ表示・ハッシュのみ保存）、A2（同じ文言）、A6（8文字以上）、
 * B1（企業名）、B2（初期資金）。
 *
 * 使い方: サーバーを起動しておいて `node scripts/check-accounts.mjs`
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

const password = 'good-password-1234';

console.log('\n=== 短いパスワードは断る（受け入れ基準 A6）===');
const short = await post('/store/accounts', { password: 'short', organization_name: 'A社' });
expect('断られた', short.status, 400);

console.log('\n=== 企業名が空、または長すぎるときは断る（同 B1）===');
expect(
  '空は断られた',
  (await post('/store/accounts', { password, organization_name: '  ' })).status,
  400,
);
expect(
  '41文字は断られた',
  (await post('/store/accounts', { password, organization_name: 'あ'.repeat(41) })).status,
  400,
);

console.log('\n=== アカウントを作る（同 A1・B1・B2）===');
const name = `NEKO DESIGN ${Date.now()}`;
const created = await post('/store/accounts', { password, organization_name: name });
expect('作れた', created.status, 201);

const marketId = created.body?.market_id;
const recoveryCode = created.body?.recovery_code;
expect('Market ID の形', /^MKT-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(marketId ?? ''), true);
expect(
  'Recovery Code の形',
  /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(recoveryCode ?? ''),
  true,
);
expect('初期資金が入っている', created.body?.balance?.total, 100_000);

console.log('\n=== Recovery Code は平文で保存されない（同 A1）===');
const bare = recoveryCode?.replaceAll('-', '') ?? '';
const stored = await client.query(
  `SELECT count(*)::int AS hits FROM auth_identity
   WHERE app_metadata::text LIKE $1 OR app_metadata::text LIKE $2`,
  [`%${recoveryCode}%`, `%${bare}%`],
);
expect('平文はどこにも無い', stored.rows[0].hits, 0);

console.log('\n=== 作った Market ID でログインできる（同 A2）===');
const login = await post('/auth/customer/emailpass', { email: marketId, password });
expect('ログインできた', login.status, 200);
expect('トークンが出た', typeof login.body?.token === 'string', true);

console.log('\n=== ID 不在とパスワード誤りが同じ応答（同 A2）===');
const missing = await post('/auth/customer/emailpass', {
  email: 'MKT-ZZZZ-ZZZZ',
  password,
});
const wrong = await post('/auth/customer/emailpass', { email: marketId, password: 'wrong-one-99' });
expect('状態が同じ', [missing.status, wrong.status], [401, 401]);
expect('本文が同じ', JSON.stringify(missing.body) === JSON.stringify(wrong.body), true);

console.log('\n=== 同じ企業名は2社作れない（同 B1）===');
const duplicateName = `DUPLICATE ${Date.now()}`;
const first = await post('/store/accounts', { password, organization_name: duplicateName });
expect('1社目は作れた', first.status, 201);
const second = await post('/store/accounts', { password, organization_name: duplicateName });
expect('2社目は断られた', second.status, 409);

console.log('\n=== 大文字小文字だけの違いも同じ名前とみなす（同 B1）===');
const cased = await post('/store/accounts', {
  password,
  organization_name: duplicateName.toLowerCase(),
});
expect('小文字にしても断られた', cased.status, 409);

console.log('\n=== 企業ができている（同 B1）===');
const orgRows = await client.query('SELECT name FROM organization WHERE market_id = $1', [
  marketId,
]);
expect('企業が1社ある', orgRows.rows.length, 1);
expect('名前が入っている', orgRows.rows[0]?.name, name);

await client.end();

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length} 件が通りませんでした:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('すべて通りました。');
