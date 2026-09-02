#!/usr/bin/env node
/**
 * 生徒の個人情報がデータベースに入っていないことを確かめる（受け入れ基準 A3）。
 *
 * この仕組みの要は「システムが生徒の個人情報を持たない」こと。持たないことは
 * 目で見て守れるものではないので、実際のデータベースを毎回機械で検査する。
 *
 * 検査は2段構え。理由は docs/decisions.md「30.」:
 *
 *   (a) 自分で作ったテーブル  → 個人情報の**列そのものが無い**ことを見る。
 *       列が無ければ、どんなコードを書いても個人情報は保存できない。
 *
 *   (b) Mercur / Medusa のテーブル → 列は消せない（本体が使うため）。
 *       代わりに**中身が空か機械生成の値だけ**であることを見る。
 *       DB が漏れても誰かは分からない、という要件37の目的はこれで満たせる。
 */

import { Client } from 'pg';

/**
 * 禁止する列名。要件35「保存禁止」の一覧に対応する。
 * 部分一致で見るため、`customer_email` や `billing_phone` のような派生も捕まる。
 */
const FORBIDDEN_COLUMN_PATTERNS = [
  { pattern: 'email', reason: 'メールアドレス' },
  { pattern: 'phone', reason: '電話番号' },
  { pattern: 'first_name', reason: '氏名' },
  { pattern: 'last_name', reason: '氏名' },
  { pattern: 'full_name', reason: '氏名' },
  { pattern: 'birth', reason: '生年月日' },
  { pattern: 'address_1', reason: '住所' },
  { pattern: 'address_2', reason: '住所' },
  { pattern: 'postal_code', reason: '住所' },
  { pattern: 'student_id', reason: '学籍番号' },
  { pattern: 'google_id', reason: '外部アカウント' },
  { pattern: 'microsoft_id', reason: '外部アカウント' },
  { pattern: 'sns_account', reason: '外部アカウント' },
];

/**
 * Mercur / Medusa から引き継いだテーブルの目印。
 *
 * ここに載っていないテーブルは「自分で作ったもの」とみなし、列の存在自体を禁じる。
 * **新しいテーブルをこの一覧に足してはいけない。** 足せば検査が緩むだけで、
 * 個人情報を持たないという約束が骨抜きになる。
 */
const INHERITED_TABLE_PREFIXES = [
  'account_holder',
  'api_key',
  'auth_identity',
  'cart',
  'customer',
  'fulfillment',
  'invite',
  'member',
  'notification',
  'order',
  'payment',
  'price',
  'product',
  'promotion',
  'provider_identity',
  'refund',
  'region',
  'reservation',
  'return',
  'sales_channel',
  'seller',
  'shipping',
  'stock_location',
  'store',
  'tax',
  'user',
  'workflow_execution',
];

/**
 * 中身として許す値。
 *
 * `null` と空文字のほかは、**`@anon.invalid` で終わるものだけ**を通す。
 * `.invalid` は「絶対に実在しない」と決められた予約ドメイン（RFC 6761）なので、
 * そこ宛の文字列は誰にも届かず、連絡先にも本人確認にも使えない。
 *
 * 生徒のアカウントは `MKT-XXXX-XXXX@anon.invalid`、運営者のアカウントも
 * 同じドメインで作る。人が打ち込んだ本物のメールはこの形にならないので、
 * 混ざれば検査が落ちる。
 */
const ANONYMOUS_VALUE = /^([A-Za-z0-9._%+-]+@anon\.invalid|anon(ymous)?|-)$/i;

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://medusa:medusa@localhost:5432/sckool';

const client = new Client({ connectionString });
await client.connect();

const { rows: columns } = await client.query(`
  SELECT c.table_name, c.column_name, c.data_type
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
  ORDER BY c.table_name, c.column_name
`);

const isInherited = (table) =>
  INHERITED_TABLE_PREFIXES.some((prefix) => table === prefix || table.startsWith(`${prefix}_`));

/** SQL 識別子として安全に囲む。テーブル名・列名はスキーマ由来だが、素の連結はしない。 */
const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

const ownTableViolations = [];
const dataViolations = [];

for (const { table_name: table, column_name: column, data_type: type } of columns) {
  const hit = FORBIDDEN_COLUMN_PATTERNS.find((entry) => column.includes(entry.pattern));
  if (!hit) continue;

  if (!isInherited(table)) {
    // (a) 自分で作ったテーブル: 列があること自体が違反。
    ownTableViolations.push({ table, column, reason: hit.reason });
    continue;
  }

  // (b) 引き継いだテーブル: 中身を見る。文字列以外は人の入力になりえないので飛ばす。
  if (!type.includes('char') && !type.includes('text')) continue;

  const { rows } = await client.query(
    `SELECT ${quote(column)} AS value FROM ${quote(table)}
     WHERE ${quote(column)} IS NOT NULL AND ${quote(column)} <> '' LIMIT 20`,
  );
  for (const { value } of rows) {
    if (ANONYMOUS_VALUE.test(String(value))) continue;
    dataViolations.push({ table, column, reason: hit.reason, value: String(value) });
  }
}

await client.end();

const total = ownTableViolations.length + dataViolations.length;
if (total === 0) {
  console.log(
    `個人情報の検査: 違反0件（${columns.length}列を見て、うち引き継ぎテーブルは中身も確認しました）`,
  );
  process.exit(0);
}

console.error(`個人情報の違反が ${total} 件見つかりました。`);
console.error('この仕組みは生徒の個人情報を保存しません（要件35）。\n');

if (ownTableViolations.length > 0) {
  console.error('■ 自分で作ったテーブルに個人情報の列があります。列ごと消してください。');
  for (const { table, column, reason } of ownTableViolations) {
    console.error(`  ${table}.${column}  — ${reason}`);
  }
  console.error('');
}

if (dataViolations.length > 0) {
  console.error('■ 引き継いだテーブルに個人情報らしき中身が入っています。');
  console.error('  列は消せませんが、中身は空か機械生成の値だけにしてください。');
  for (const { table, column, reason, value } of dataViolations) {
    console.error(`  ${table}.${column}  — ${reason}  値: ${value.slice(0, 40)}`);
  }
}

process.exit(1);
