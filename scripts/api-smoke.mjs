#!/usr/bin/env node
/**
 * apps/api を実際に起動し、/health が 200 を返すことを確かめてから落とす。
 *
 * CI で「起動する状態」を守るための検査。ビルドが通ることと起動できることは別で、
 * モジュールの解決や設定の誤りは起動して初めて分かる。
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:9000';
/** 起動を待つ上限。CI の遅い実行機でも足りるだけ取る。 */
const TIMEOUT_MS = Number(process.env.API_SMOKE_TIMEOUT_MS ?? 180_000);
const POLL_INTERVAL_MS = 2_000;

/**
 * `detached: true` にして自分のプロセスグループを持たせる。グループごと止められないと
 * 孫（medusa 本体）が生き残り、標準出力をつかんだまま CI のステップが終わらない。
 */
const server = spawn(process.execPath, [join(repoRoot, 'scripts', 'run-api.mjs'), 'start'], {
  cwd: repoRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});

/** 失敗したときに何が起きていたかを見せるため、出力は捨てずに貯めておく。 */
const output = [];
const collect = (chunk) => output.push(chunk.toString());
server.stdout.on('data', collect);
server.stderr.on('data', collect);

let serverExited = false;
server.on('exit', () => {
  serverExited = true;
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHealth() {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (serverExited) throw new Error('サーバーが起動途中で終了しました');
    try {
      const response = await fetch(new URL('/health', BASE_URL));
      if (response.ok) return await response.text();
    } catch {
      // まだ起動していないだけ。時間切れまで繰り返す。
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`${TIMEOUT_MS}ミリ秒待っても /health が応答しませんでした`);
}

/** サーバーとその配下をまとめて止める。 */
function signalGroup(signal) {
  try {
    process.kill(-server.pid, signal);
  } catch {
    // すでに終わっていれば何もしなくてよい。
  }
}

async function stopServer() {
  if (serverExited) return;
  signalGroup('SIGTERM');
  await Promise.race([once(server, 'exit'), sleep(10_000)]);
  if (!serverExited) signalGroup('SIGKILL');
}

try {
  const body = await waitForHealth();
  console.log(`起動確認: /health が 200 を返しました（本文: ${body.trim()}）`);
  await stopServer();
  process.exit(0);
} catch (error) {
  console.error(`起動確認に失敗しました: ${error.message}`);
  console.error('--- サーバーの出力 ---');
  console.error(output.join('').slice(-8000));
  await stopServer();
  process.exit(1);
}
