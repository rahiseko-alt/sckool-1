#!/usr/bin/env node
/**
 * apps/api を起動し、応答するのを待ってから、渡されたコマンドを実行して、最後に落とす。
 *
 * 使い方:
 *   node scripts/with-api.mjs node scripts/check-accounts.mjs
 *
 * 「動いているサーバーに触って確かめる」種類の検査を、CI でも手元でも
 * 同じ1コマンドで走らせるための道具。起動と後片付けを毎回書くと、
 * 落とし忘れたサーバーが次の検査を邪魔する（実際に EADDRINUSE で詰まった）。
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:9000';
const TIMEOUT_MS = Number(process.env.API_START_TIMEOUT_MS ?? 180_000);

/**
 * 実行したいコマンド。`--` で区切ると、いくつでも順に実行できる。
 *
 *   node scripts/with-api.mjs node a.mjs -- node b.mjs
 *
 * 1つずつ書けるようにしたのは、サーバーの起動が重く（30秒前後）、
 * 検査のたびに立て直すと CI が伸びるため。
 */
const commands = process.argv
  .slice(2)
  .reduce(
    (groups, arg) => {
      if (arg === '--') groups.push([]);
      else groups[groups.length - 1].push(arg);
      return groups;
    },
    [[]],
  )
  .filter((group) => group.length > 0);

if (commands.length === 0) {
  console.error('使い方: node scripts/with-api.mjs <コマンド> [-- <コマンド> ...]');
  process.exit(1);
}

/**
 * `detached: true` にして、サーバーを自分のプロセスグループに入れる。
 *
 * グループごと止められないと孫（medusa 本体）が生き残り、標準出力を
 * つかんだままになる。CI のステップが終わらなくなる（実際に起きた）。
 */
const server = spawn(process.execPath, [join(repoRoot, 'scripts', 'run-api.mjs'), 'start'], {
  cwd: repoRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});

/** 失敗したときに何が起きていたかを見せるため、出力は貯めておく。 */
const serverOutput = [];
server.stdout.on('data', (chunk) => serverOutput.push(chunk.toString()));
server.stderr.on('data', (chunk) => serverOutput.push(chunk.toString()));

let serverExited = false;
server.on('exit', () => {
  serverExited = true;
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForReady() {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (serverExited) throw new Error('サーバーが起動途中で終了しました');
    try {
      const response = await fetch(new URL('/health', BASE_URL));
      if (response.ok) return;
    } catch {
      // まだ起動していないだけ。
    }
    await sleep(2_000);
  }
  throw new Error(`${TIMEOUT_MS}ミリ秒待っても起動しませんでした`);
}

/** サーバーとその配下をまとめて止める。1つでも残ると次の実行が port を取れない。 */
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
  await waitForReady();
} catch (error) {
  console.error(`サーバーを起動できませんでした: ${error.message}`);
  console.error(serverOutput.join('').slice(-4000));
  await stopServer();
  process.exit(1);
}

// どれか1つでも失敗したら、そこで止めて失敗として返す。
// 続きを走らせても、前の失敗が原因の連鎖でしかない。
for (const command of commands) {
  const child = spawn(command[0], command.slice(1), { cwd: repoRoot, stdio: 'inherit' });
  const [code] = await once(child, 'exit');
  if (code !== 0) {
    await stopServer();
    process.exit(code ?? 1);
  }
}

await stopServer();
process.exit(0);
