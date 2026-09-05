#!/usr/bin/env node
/**
 * 生徒が見る画面（apps/storefront）を組み立てて配り、渡されたコマンドを実行して、最後に落とす。
 *
 * 使い方（バックエンドは別に起動しておく）:
 *   node scripts/with-api.mjs node scripts/with-storefront.mjs node scripts/check-e2e.mjs
 *
 * `scripts/with-api.mjs` はバックエンドしか立てない。ブラウザで人と同じ手順を
 * なぞる検査には**画面も要る**ので、その相方としてこれを置いた。
 *
 * 組み立て直すのは、**公開鍵が組み立て時に埋め込まれる**ため
 * （`apps/storefront/vite.config.ts` の `define`）。鍵は `pnpm run seed` が作るので、
 * CI の `pnpm run storefront:build` の時点ではまだ無い。鍵の無い画面は
 * 商品が0件になり、検査が「商品が見つからない」で落ちる。
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const storefrontDir = join(repoRoot, 'apps', 'storefront');

const PORT = Number(process.env.STOREFRONT_PORT ?? 8000);
const STOREFRONT_URL = `http://localhost:${PORT}/`;
const BACKEND_URL = process.env.API_BASE_URL ?? 'http://localhost:9000';
const TIMEOUT_MS = Number(process.env.STOREFRONT_START_TIMEOUT_MS ?? 60_000);
const connectionString =
  process.env.DATABASE_URL ?? 'postgres://medusa:medusa@localhost:5432/sckool';

/** `--` で区切ると、いくつでも順に実行できる（`with-api.mjs` と同じ書き方）。 */
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
  console.error('使い方: node scripts/with-storefront.mjs <コマンド> [-- <コマンド> ...]');
  process.exit(1);
}

/**
 * 公開鍵はデータベースから取る。
 *
 * 出力から切り出すと途中で切れる（67文字ある）。`pnpm run seed` が作った鍵をそのまま読む。
 */
const client = new Client({ connectionString });
await client.connect();
const { rows } = await client.query(
  `SELECT token FROM api_key WHERE type = 'publishable' AND revoked_at IS NULL
   ORDER BY created_at DESC LIMIT 1`,
);
await client.end();

const publishableKey = rows[0]?.token;
if (!publishableKey) {
  console.error('公開鍵がありません。先に pnpm run seed を実行してください。');
  process.exit(1);
}

const env = {
  ...process.env,
  VITE_PUBLISHABLE_KEY: publishableKey,
  VITE_BACKEND_URL: BACKEND_URL,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** vite を1つ動かす。`detached` にして孫までまとめて止められるようにする。 */
function runVite(args, options = {}) {
  return spawn('pnpm', ['exec', 'vite', ...args], {
    cwd: storefrontDir,
    env,
    detached: true,
    ...options,
  });
}

console.log('生徒の画面を組み立てています（公開鍵を埋め込むため組み立て直します）...');
const build = runVite(['build'], { stdio: 'inherit' });
const [buildCode] = await once(build, 'exit');
if (buildCode !== 0) {
  console.error('生徒の画面を組み立てられませんでした');
  process.exit(buildCode ?? 1);
}

/**
 * 配るのは組み立て済みのもの（`vite preview`）。
 * 開発サーバーは初回に依存を変換するぶん立ち上がりが遅く、CI が伸びる。
 */
const server = runVite(['preview', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

const serverOutput = [];
server.stdout.on('data', (chunk) => serverOutput.push(chunk.toString()));
server.stderr.on('data', (chunk) => serverOutput.push(chunk.toString()));

let serverExited = false;
server.on('exit', () => {
  serverExited = true;
});

async function waitForReady() {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (serverExited) throw new Error('画面の配信が起動途中で終了しました');
    try {
      const response = await fetch(STOREFRONT_URL);
      if (response.ok) return;
    } catch {
      // まだ起動していないだけ。
    }
    await sleep(1_000);
  }
  throw new Error(`${TIMEOUT_MS}ミリ秒待っても起動しませんでした`);
}

/** 子とその孫まで、まとめて止める。1つでも残ると次の実行が port を取れない。 */
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
  await Promise.race([once(server, 'exit'), sleep(5_000)]);
  if (!serverExited) signalGroup('SIGKILL');
}

try {
  await waitForReady();
} catch (error) {
  console.error(`画面を配れませんでした: ${error.message}`);
  console.error(serverOutput.join('').slice(-4000));
  await stopServer();
  process.exit(1);
}

console.log(`生徒の画面: ${STOREFRONT_URL}（バックエンド: ${BACKEND_URL}）`);

for (const command of commands) {
  const child = spawn(command[0], command.slice(1), {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...env, STOREFRONT_URL },
  });
  const [code] = await once(child, 'exit');
  if (code !== 0) {
    await stopServer();
    process.exit(code ?? 1);
  }
}

await stopServer();
process.exit(0);
