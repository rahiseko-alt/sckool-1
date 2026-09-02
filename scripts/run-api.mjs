#!/usr/bin/env node
/**
 * apps/api（Medusa / Mercur）を、開発用の既定値を環境変数で与えて起動する。
 *
 * `.env` を作らないのは、このリポジトリでは `.env` の読み書きを禁じているため
 * （AGENTS.md「やってはいけないこと」）。Medusa は `loadEnv` で `.env` を読むが、
 * 既に環境変数が入っていればそちらが優先されるので、ここで渡せば足りる。
 *
 * 本番の値は運用側が環境変数で与える。ここにある既定値は開発専用。
 * キー名の一覧は `.env.example` にある。
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const apiDir = join(repoRoot, 'apps', 'api');

/** 開発用の既定値。既に環境変数があればそれを使う（上書きしない）。 */
const defaults = {
  DATABASE_URL: 'postgres://medusa:medusa@localhost:5432/sckool',
  REDIS_URL: 'redis://localhost:6379',
  STORE_CORS: 'http://localhost:8000,http://localhost:3000',
  ADMIN_CORS: 'http://localhost:7000,http://localhost:9000',
  VENDOR_CORS: 'http://localhost:7001',
  AUTH_CORS:
    'http://localhost:3000,http://localhost:7000,http://localhost:7001,http://localhost:9000',
  MERCUR_VENDOR_URL: 'http://localhost:7001',
  STOREFRONT_REVALIDATE_URL: 'http://localhost:3000',
  // 開発専用の値。本番では必ず環境変数で別の値を与えること。
  JWT_SECRET: 'dev-only-not-a-secret',
  COOKIE_SECRET: 'dev-only-not-a-secret',
  STOREFRONT_REVALIDATE_SECRET: 'dev-only-not-a-secret',
};

const env = { ...process.env };
for (const [key, value] of Object.entries(defaults)) {
  env[key] ??= value;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('使い方: node scripts/run-api.mjs <medusa のサブコマンド>');
  console.error('例: node scripts/run-api.mjs develop');
  process.exit(1);
}

const child = spawn('pnpm', ['exec', 'medusa', ...args], {
  cwd: apiDir,
  env,
  stdio: 'inherit',
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
