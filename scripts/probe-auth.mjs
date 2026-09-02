#!/usr/bin/env node
/**
 * Market ID を認証の識別子として使えるかを、実際に API を叩いて確かめる（T004）。
 *
 * 標準の emailpass プロバイダは識別子を `email` という名前で受け取るが、
 * 中身がメールアドレスの形かどうかは検査していない（実装を読んだ結果）。
 * 読んだだけでは確証にならないので、本当に通るかをここで実行して確かめる。
 */

const BASE = process.env.API_BASE_URL ?? 'http://localhost:9000';

/** 紛らわしい文字を避けた Market ID を1つ作る（本実装は T007 で別に用意する）。 */
const marketId = `MKT-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random()
  .toString(36)
  .slice(2, 6)
  .toUpperCase()}`;
const password = 'probe-password-1234';

async function call(path, body) {
  const response = await fetch(new URL(path, BASE), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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

console.log(`使う Market ID: ${marketId}\n`);

console.log('1) Market ID をそのまま識別子にして登録する');
const registered = await call('/auth/customer/emailpass/register', {
  email: marketId,
  password,
});
console.log(`   → ${registered.status} ${JSON.stringify(registered.body).slice(0, 160)}\n`);

console.log('2) 同じ Market ID とパスワードでログインする');
const loggedIn = await call('/auth/customer/emailpass', { email: marketId, password });
console.log(`   → ${loggedIn.status} ${JSON.stringify(loggedIn.body).slice(0, 160)}\n`);

console.log('3) 存在しない Market ID でログインする（文言の比較用）');
const missing = await call('/auth/customer/emailpass', {
  email: 'MKT-ZZZZ-ZZZZ',
  password,
});
console.log(`   → ${missing.status} ${JSON.stringify(missing.body)}\n`);

console.log('4) 正しい Market ID とまちがったパスワードでログインする');
const wrongPassword = await call('/auth/customer/emailpass', {
  email: marketId,
  password: 'wrong-password-9999',
});
console.log(`   → ${wrongPassword.status} ${JSON.stringify(wrongPassword.body)}\n`);

const sameMessage =
  JSON.stringify(missing.body) === JSON.stringify(wrongPassword.body) &&
  missing.status === wrongPassword.status;
console.log(`3と4の応答が同一か（受け入れ基準 A2）: ${sameMessage ? 'はい' : 'いいえ'}`);
