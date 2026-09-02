#!/usr/bin/env node
/**
 * 開発用の PostgreSQL と Redis を起動・停止する。
 *
 * この実行環境では Docker デーモンが動いていない（CLI だけある）ため、
 * docker-compose ではなくローカルにインストール済みのサーバーを直接起動する。
 * 経緯は docs/decisions.md「29.」。
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const PG_BIN = '/usr/lib/postgresql/16/bin';
const PG_DATA = '/var/lib/postgresql/16/main';
/**
 * Debian 系のパッケージはデータ領域と設定ファイルを別の場所に置く。
 * postgres 本体は設定をデータ領域から探すため、明示的に渡さないと起動しない。
 */
const PG_CONF = '/etc/postgresql/16/main/postgresql.conf';
const PG_PORT = 5432;
const PG_USER = 'medusa';
const PG_PASSWORD = 'medusa';
const PG_DATABASE = 'sckool';
const REDIS_PORT = 6379;
const RUNTIME_DIR = join(repoRoot, 'tmp');

/** postgres はサーバーを root で起動できないため、必ず postgres ユーザーへ落とす。 */
function asPostgres(command) {
  return spawnSync('su', ['postgres', '-c', command], { encoding: 'utf8' });
}

function pgIsRunning() {
  return asPostgres(`${PG_BIN}/pg_ctl -D ${PG_DATA} status`).status === 0;
}

function redisIsRunning() {
  return (
    spawnSync('redis-cli', ['-p', String(REDIS_PORT), 'ping'], {
      encoding: 'utf8',
    }).stdout?.trim() === 'PONG'
  );
}

function startPostgres() {
  if (pgIsRunning()) {
    console.log('PostgreSQL: すでに動いています');
  } else {
    const log = '/var/lib/postgresql/16/main.log';
    const started = asPostgres(
      `${PG_BIN}/pg_ctl -D ${PG_DATA} -l ${log} -o "-c config_file=${PG_CONF} -p ${PG_PORT}" -w start`,
    );
    if (started.status !== 0) {
      console.error(started.stdout, started.stderr);
      throw new Error('PostgreSQL を起動できませんでした');
    }
    console.log('PostgreSQL: 起動しました');
  }
  ensureRole();
  ensureDatabase();
}

/** 役割とデータベースは何度実行しても同じ結果になるようにする（開発中に何度も走らせるため）。 */
function ensureRole() {
  const exists = asPostgres(
    `${PG_BIN}/psql -p ${PG_PORT} -tAc "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'"`,
  ).stdout?.trim();
  if (exists === '1') return;
  asPostgres(
    `${PG_BIN}/psql -p ${PG_PORT} -c "CREATE ROLE ${PG_USER} LOGIN SUPERUSER PASSWORD '${PG_PASSWORD}'"`,
  );
  console.log(`PostgreSQL: 役割 ${PG_USER} を作りました`);
}

function ensureDatabase() {
  const exists = asPostgres(
    `${PG_BIN}/psql -p ${PG_PORT} -tAc "SELECT 1 FROM pg_database WHERE datname='${PG_DATABASE}'"`,
  ).stdout?.trim();
  if (exists === '1') return;
  asPostgres(`${PG_BIN}/createdb -p ${PG_PORT} -O ${PG_USER} ${PG_DATABASE}`);
  console.log(`PostgreSQL: データベース ${PG_DATABASE} を作りました`);
}

function startRedis() {
  if (redisIsRunning()) {
    console.log('Redis: すでに動いています');
    return;
  }
  mkdirSync(RUNTIME_DIR, { recursive: true });
  execFileSync('redis-server', [
    '--port',
    String(REDIS_PORT),
    '--daemonize',
    'yes',
    '--dir',
    RUNTIME_DIR,
    '--save',
    '',
  ]);
  console.log('Redis: 起動しました');
}

function stop() {
  if (pgIsRunning()) {
    asPostgres(`${PG_BIN}/pg_ctl -D ${PG_DATA} -m fast -w stop`);
    console.log('PostgreSQL: 停止しました');
  }
  if (redisIsRunning()) {
    spawnSync('redis-cli', ['-p', String(REDIS_PORT), 'shutdown', 'nosave']);
    console.log('Redis: 停止しました');
  }
}

function status() {
  console.log(`PostgreSQL: ${pgIsRunning() ? '動いています' : '止まっています'}`);
  console.log(`Redis: ${redisIsRunning() ? '動いています' : '止まっています'}`);
}

if (!existsSync(PG_DATA)) {
  console.error(`PostgreSQL のデータ領域が見つかりません: ${PG_DATA}`);
  process.exit(1);
}

const command = process.argv[2] ?? 'start';
if (command === 'start') {
  startPostgres();
  startRedis();
  console.log(
    `\nDATABASE_URL=postgres://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${PG_DATABASE}`,
  );
  console.log(`REDIS_URL=redis://localhost:${REDIS_PORT}`);
} else if (command === 'stop') {
  stop();
} else if (command === 'status') {
  status();
} else {
  console.error(`使い方: node scripts/dev-services.mjs [start|stop|status]`);
  process.exit(1);
}
