#!/usr/bin/env node
/**
 * 取引履歴が本当に追記だけかを、データベースに直接手を出して確かめる
 * （受け入れ基準 K3）。
 *
 * **API に経路が無いことは証拠にならない。** 判定役が `psql` から
 * `UPDATE mp_ledger_entry SET amount=999999` を投げたら `UPDATE 1` で通り、
 * `DELETE` も通った。守りはアプリの中の約束だけで、仕組みになっていなかった。
 *
 * ここが見るのは3つ。
 *   1. 更新が拒まれること
 *   2. 削除が拒まれること
 *   3. 追記（取り消しの逆仕訳）は今までどおりできること
 *
 * **`scripts/check-bonus-expiry.mjs` が時計を進めるために引き金を一時的に
 * 外す**ので、この検査はそのあとに走らせること。外しっぱなしになっていれば
 * ここで落ちる。
 *
 * 使い方: `node scripts/check-append-only.mjs`（サーバーは要らない）
 */

import { Client } from 'pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://medusa:medusa@localhost:5432/sckool';

const client = new Client({ connectionString });
await client.connect();

const failures = [];
const expect = (label, actual, wanted) => {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  console.log(`  ${ok ? '通った' : '通らない'}: ${label}（${JSON.stringify(actual)}）`);
  if (!ok) failures.push(label);
};

/** 拒まれたかどうかだけを返す。拒まれ方（文言）は問わない。 */
const refused = async (sql, params) => {
  try {
    await client.query('begin');
    await client.query(sql, params);
    await client.query('rollback');
    return false;
  } catch {
    await client.query('rollback');
    return true;
  }
};

console.log('\n=== 引き金がかかっている（受け入れ基準 K3）===');
const { rows: triggers } = await client.query(
  `SELECT tgname, tgenabled FROM pg_trigger
    WHERE tgrelid = 'mp_ledger_entry'::regclass AND NOT tgisinternal
    ORDER BY tgname`,
);
expect(
  '更新と削除の引き金が両方あり、有効になっている',
  triggers.map((row) => `${row.tgname}:${row.tgenabled}`),
  ['mp_ledger_entry_no_delete:O', 'mp_ledger_entry_no_update:O'],
);

console.log('\n=== 実際に書き換えを試す ===');
const { rows: sample } = await client.query(
  `SELECT id, organization_id, amount FROM mp_ledger_entry ORDER BY created_at LIMIT 1`,
);
if (!sample[0]) {
  console.error('取引履歴が1行も無いので確かめられません。先に pnpm run seed を実行してください。');
  await client.end();
  process.exit(1);
}
const target = sample[0];

expect(
  '金額の書き換えは拒まれる',
  await refused(`UPDATE mp_ledger_entry SET amount = 999999 WHERE id = $1`, [target.id]),
  true,
);
expect(
  '期限の書き換えも拒まれる',
  await refused(`UPDATE mp_ledger_entry SET expires_at = now() WHERE id = $1`, [target.id]),
  true,
);
expect(
  '論理削除（deleted_at を立てる）も拒まれる',
  await refused(`UPDATE mp_ledger_entry SET deleted_at = now() WHERE id = $1`, [target.id]),
  true,
);
expect(
  '削除は拒まれる',
  await refused(`DELETE FROM mp_ledger_entry WHERE id = $1`, [target.id]),
  true,
);

console.log('\n=== 追記（取り消しの逆仕訳）は今までどおりできる ===');
// 拒まれないことを見るだけなので、書いたあと巻き戻す。
let appended = false;
try {
  await client.query('begin');
  // `raw_amount` は Medusa が金額に付ける入れ物。手で書くときも必須。
  const amount = -Number(target.amount);
  await client.query(
    `INSERT INTO mp_ledger_entry (id, organization_id, amount, raw_amount, kind, pocket, reference)
     VALUES ($1, $2, $3, $4, 'reversal', 'normal', $5)`,
    [
      `mple_probe${Date.now()}`,
      target.organization_id,
      amount,
      JSON.stringify({ value: String(amount), precision: 20 }),
      target.id,
    ],
  );
  appended = true;
} catch (error) {
  console.error(`  追記に失敗しました: ${error.message}`);
} finally {
  await client.query('rollback');
}
expect('反対向きの行は足せる', appended, true);

await client.end();

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length}件が通りませんでした。`);
  console.error('取引履歴は追記だけにする決まりです（受け入れ基準 K3）。');
  process.exit(1);
}
console.log('取引履歴は追記だけです（更新・削除ともデータベースが拒みました）。');
