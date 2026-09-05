#!/usr/bin/env node
/**
 * 起動中の apps/api に HTTP で触って、応答をそのまま表示する。
 *
 * `verify` の手順に出てくる「/health に触って 200 が返ること」を、
 * 誰でも同じコマンドで確かめられるようにするための道具。
 * リダイレクトは追いかける（画面の入口は 301 で本体へ飛ばすことがあるため）。
 */

const base = process.env.API_BASE_URL ?? 'http://localhost:9000';
const paths = process.argv.slice(2);
const targets = paths.length > 0 ? paths : ['/health', '/dashboard', '/seller'];

let failed = false;

for (const path of targets) {
  const url = new URL(path, base);
  try {
    const response = await fetch(url, { redirect: 'follow' });
    const body = await response.text();
    const head = body.slice(0, 100).replace(/\s+/g, ' ').trim();
    const movedTo = response.url === url.href ? '' : ` → ${new URL(response.url).pathname}`;
    console.log(`${response.status} ${url.pathname}${movedTo}  ${head}`);
    if (response.status >= 400) failed = true;
  } catch (error) {
    console.log(`--- ${url.pathname} 接続できません: ${error.message}`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
