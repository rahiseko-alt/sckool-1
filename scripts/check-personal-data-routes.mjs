#!/usr/bin/env node
/**
 * 個人情報を入れられる経路が閉じているかを、動いているサーバーで確かめる
 * （受け入れ基準 A3、要件35・37）。
 *
 * **「いま入っていないか」ではなく「入れられるか」を見る。**
 * `scripts/check-no-personal-data.mjs` はデータベースの中身を見る検査で、
 * こちらは入口そのものを見る。判定役が実際に `POST /store/customers` を呼んで
 * 氏名・メール・電話を保存できてしまうことを見つけたため足した。
 *
 * 塞いだあとにアカウント作成とログインが壊れていないことも、ここで一緒に見る。
 *
 * 使い方: サーバーを起動しておいて `node scripts/check-personal-data-routes.mjs`
 */

import pg from 'pg';
const wait = async (url) => {
  for (let i = 0; i < 90; i++) {
    try {
      await fetch(url);
      return;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
};
await wait('http://localhost:9000/health');
const c = new pg.Client({ connectionString: 'postgres://medusa:medusa@localhost:5432/sckool' });
await c.connect();
const key = (
  await c.query(
    "SELECT token FROM api_key WHERE type='publishable' AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1",
  )
).rows[0].token;
await c.end();
const H = { 'content-type': 'application/json', 'x-publishable-api-key': key };
const call = async (m, p, body, token) => {
  const headers = { ...H };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch('http://localhost:9000' + p, {
    method: m,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const t = await r.text();
  return {
    s: r.status,
    b: (() => {
      try {
        return JSON.parse(t);
      } catch {
        return t;
      }
    })(),
  };
};

const failures = [];
const expect = (label, actual, wanted) => {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  console.log(`  ${ok ? '通った' : '通らない'}: ${label}（${JSON.stringify(actual)}）`);
  if (!ok) failures.push(label);
};

console.log('\n=== 個人情報を入れる経路が塞がっている（受け入れ基準 A3）===');
expect(
  'メールで登録する経路は404',
  (
    await call('POST', '/auth/customer/emailpass/register', {
      email: 'x@example.com',
      password: 'good-password-1234',
    })
  ).s,
  404,
);
expect(
  '顧客を作る経路は404',
  (await call('POST', '/store/customers', { email: 'x@example.com', first_name: '太郎' })).s,
  404,
);
expect('顧客の自分の情報も404', (await call('GET', '/store/customers/me')).s, 404);
expect(
  '顧客の住所も404',
  (await call('POST', '/store/customers/me/addresses', { first_name: '太郎' })).s,
  404,
);

/**
 * **運営者側の入口も塞ぐ。** 生徒の画面を塞いでも、先生が管理画面から
 * 生徒の氏名・電話番号を打ち込めるなら、DB に個人情報が入る。
 * 判定役が実際に `POST /admin/customers` で「山田 花子 / 080-9999-8888」を
 * 保存できることを見つけたため足した。
 *
 * 生徒側と違い、**合鍵を持った運営者として**叩かないと意味がない。
 * 合鍵なしで 401 が返るのを見て「塞がっている」と誤判定するため。
 */
console.log('\n=== 運営者の入口も塞がっている（受け入れ基準 A3）===');
const adminLogin = await call('POST', '/auth/user/emailpass', {
  email: 'probe-admin@anon.invalid',
  password: 'probe-password-1234',
});
const adminToken = adminLogin.b?.token;
expect('運営者の合鍵を取れた', typeof adminToken, 'string');
expect(
  '運営者でも顧客を作れない',
  (
    await call(
      'POST',
      '/admin/customers',
      { email: 'probe@example.com', first_name: '花子', last_name: '山田', phone: '080-0000-0000' },
      adminToken,
    )
  ).s,
  404,
);
expect(
  '運営者でも顧客の一覧を見られない',
  (await call('GET', '/admin/customers', undefined, adminToken)).s,
  404,
);
expect(
  '運営者でも顧客の住所を作れない',
  (
    await call(
      'POST',
      '/admin/customers/cus_x/addresses',
      { first_name: '花子', address_1: '東京都千代田区1-1' },
      adminToken,
    )
  ).s,
  404,
);

console.log('\n=== 運営者にできることは今までどおり動く ===');
expect(
  '企業の一覧は見られる',
  (await call('GET', '/admin/organizations', undefined, adminToken)).s,
  200,
);

console.log('\n=== アカウント作成とログインは今までどおり動く ===');
const made = await call('POST', '/store/accounts', {
  password: 'good-password-1234',
  organization_name: `A3 ${Date.now()}`,
});
expect('企業を作れる', made.s, 201);
const login = await call('POST', '/auth/customer/emailpass', {
  email: made.b?.market_id,
  password: 'good-password-1234',
});
expect('ログインできる', login.s, 200);
expect('合鍵が出る', typeof login.b?.token, 'string');
const admin = await call('POST', '/auth/user/emailpass', {
  email: 'probe-admin@anon.invalid',
  password: 'probe-password-1234',
});
expect('運営者もログインできる', admin.s, 200);

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length}件が通りませんでした`);
  process.exit(1);
}
console.log('全て通りました。');
