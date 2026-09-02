#!/usr/bin/env node
/**
 * 6言語の辞書に過不足が無いかを調べる（受け入れ基準 I2、要件34）。
 *
 * **目で見て揃えるのは無理。** 1つ足りないことに誰も気づかないまま授業で使うと、
 * ある言語の生徒だけが意味の分からない画面を見ることになる。
 *
 * 使い方: `node scripts/check-i18n-keys.mjs`（サーバーは要らない）
 *
 * 判定の中身は apps/storefront/src/i18n/keys.ts にある。同じ関数を単体テストも使う。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const i18nDir = join(repoRoot, 'apps', 'storefront', 'src', 'i18n');

/**
 * TypeScript のまま読めないので、その場で JavaScript に直して読み込む。
 * 判定の中身を2箇所に書かないための遠回り。
 */
async function importTs(file) {
  const result = await build({
    entryPoints: [join(i18nDir, file)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const { findKeyProblems, findPlaceholderProblems, flattenKeys } = await importTs('keys.ts');
const { LOCALES } = await importTs('locales.ts');
const { BASE_LOCALE, ALLOW_SAME_AS_BASE } = await importTs('settings.ts');

const load = (locale) => JSON.parse(readFileSync(join(i18nDir, `${locale}.json`), 'utf8'));

const base = { locale: BASE_LOCALE, dictionary: load(BASE_LOCALE) };
const others = LOCALES.filter((locale) => locale.code !== BASE_LOCALE).map((locale) => ({
  locale: locale.code,
  dictionary: load(locale.code),
}));

console.log(`\n基準の言語: ${BASE_LOCALE}`);
console.log(`調べる言語: ${others.map((other) => other.locale).join(' / ')}`);

const problems = findKeyProblems({ base, others, allowSame: ALLOW_SAME_AS_BASE });
const placeholders = findPlaceholderProblems({ base, others });

const label = {
  missing: '訳が無い',
  empty: '空になっている',
  untranslated: '日本語のまま',
};

if (problems.length === 0 && placeholders.length === 0) {
  const keyCount = flattenKeys(base.dictionary).size;
  console.log(`\n未翻訳のキー: 0件（${keyCount}個の文字列を ${LOCALES.length} 言語ぶん確認）`);
  process.exit(0);
}

console.error(`\n${problems.length + placeholders.length}件の問題があります:\n`);

for (const problem of problems) {
  console.error(`  [${problem.locale}] ${problem.key} … ${label[problem.kind]}`);
}
for (const problem of placeholders) {
  console.error(
    `  [${problem.locale}] ${problem.key} … 差し込みが違う` +
      `（あるべき: ${problem.expected.join(', ') || 'なし'}／いま: ${problem.found.join(', ') || 'なし'}）`,
  );
}

console.error('\n辞書は apps/storefront/src/i18n/ にあります。');
process.exit(1);
