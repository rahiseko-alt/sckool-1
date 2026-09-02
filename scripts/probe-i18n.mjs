#!/usr/bin/env node
/**
 * 商品情報の多言語がどう動くかを、実際に API を叩いて確かめる（T005）。
 *
 * 確かめること:
 *   1. 商品に英語の訳を登録すると、locale=en を付けた取得で英語が返るか
 *   2. locale を付けない取得では原文（日本語）が返るか
 *   3. 訳を登録していない言語（タイ語）では原文に落ちるか
 *
 * 商品の作成は管理者の権限が要るので、まず管理者を1人作ってから進む。
 */

const BASE = process.env.API_BASE_URL ?? 'http://localhost:9000';

/**
 * 管理者アカウント。**運営者用**であって生徒のものではない。
 * 生徒は Market ID の匿名アカウントを使う（docs/decisions.md「31.」）。
 *
 * 先に CLI で作っておく必要がある:
 *   node scripts/run-api.mjs user -e probe-admin@anon.invalid -p probe-password-1234
 *
 * API からの登録（/auth/user/emailpass/register）だけでは、認証の情報はできても
 * 管理者ユーザーの実体ができず、以降の呼び出しが 401 になる。
 */
const adminIdentifier = process.env.PROBE_ADMIN ?? 'probe-admin@anon.invalid';
const adminPassword = process.env.PROBE_ADMIN_PASSWORD ?? 'probe-password-1234';

async function api(path, { method = 'GET', token, body, locale } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (locale) headers['x-medusa-locale'] = locale;
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

function show(label, result) {
  const body = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
  console.log(`${label}: ${result.status} ${body.slice(0, 200)}`);
  return result;
}

console.log('--- 準備: 管理者としてログインする ---');
const loggedIn = show(
  '管理者のログイン',
  await api('/auth/user/emailpass', {
    method: 'POST',
    body: { email: adminIdentifier, password: adminPassword },
  }),
);
const token = loggedIn.body?.token;
if (!token) {
  console.error('ログイントークンが取れませんでした。ここで中止します。');
  process.exit(1);
}

console.log('\n--- 1) 商品を作る（原文は日本語）---');
const created = show(
  '商品の作成',
  await api('/admin/products', {
    method: 'POST',
    token,
    body: {
      // 何度実行しても衝突しないよう、毎回ちがう名前にする。
      title: `ロゴ制作 ${Math.random().toString(36).slice(2, 8)}`,
      description: 'SNS用のロゴを作ります',
      status: 'published',
      // 種類（option）と在庫（variant）は、この検証では要らないので付けない。
      // Mercur が既定の option を1つ足すため、こちらから足すと数が合わなくなる。
    },
  }),
);
const productId = created.body?.product?.id;
if (!productId) {
  console.error('商品が作れませんでした。ここで中止します。');
  process.exit(1);
}
console.log(`商品 id: ${productId}`);

console.log('\n--- 2) 英語の訳を登録する ---');
show(
  '翻訳の登録',
  // 登録は /admin/translations ではなく /admin/translations/batch。
  // 前者は GET だけを持つ（実装を読んで確認）。
  await api('/admin/translations/batch', {
    method: 'POST',
    token,
    body: {
      create: [
        {
          reference: 'product',
          reference_id: productId,
          locale_code: 'en',
          translations: {
            title: 'Logo Design',
            description: 'We design a logo for your social media.',
          },
        },
      ],
    },
  }),
);

console.log('\n--- 3) locale ごとに取得して比べる ---');
for (const locale of [undefined, 'en', 'th-TH']) {
  const label = locale ?? '（指定なし）';
  const result = await api(`/admin/products/${productId}`, { token, locale });
  const title = result.body?.product?.title;
  console.log(`  locale=${label} → title="${title}"`);
}
