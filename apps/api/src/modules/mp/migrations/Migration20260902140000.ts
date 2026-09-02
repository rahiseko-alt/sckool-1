import { Migration } from '@medusajs/framework/mikro-orm/migrations'

/**
 * 取引履歴の行を**データベースの側で**書き換えられなくする（受け入れ基準 K3）。
 *
 * それまでの守りはアプリの中だけだった。API に更新・削除の経路を作らず、
 * サービスにも呼び出しを書かない、という運用の約束にすぎない。
 * 判定役が `psql` から `UPDATE mp_ledger_entry SET amount=999999` を投げたら
 * `UPDATE 1` で通り、`DELETE` も `DELETE 1` で通った。
 *
 * **約束ではなく仕組みで止める。** 追記だけを許し、更新と削除は拒む。
 * 取り消しは反対向きの行を1本足して表す（`buildReversal`）。
 */
export class Migration20260902140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create or replace function "mp_ledger_entry_append_only"() returns trigger as $$
      begin
        raise exception
          'mp_ledger_entry is append-only (acceptance criterion K3). Add a reversal row instead of % .',
          tg_op;
      end;
      $$ language plpgsql;
    `)
    this.addSql(`drop trigger if exists "mp_ledger_entry_no_update" on "mp_ledger_entry";`)
    this.addSql(`
      create trigger "mp_ledger_entry_no_update"
        before update on "mp_ledger_entry"
        for each row execute function "mp_ledger_entry_append_only"();
    `)
    this.addSql(`drop trigger if exists "mp_ledger_entry_no_delete" on "mp_ledger_entry";`)
    this.addSql(`
      create trigger "mp_ledger_entry_no_delete"
        before delete on "mp_ledger_entry"
        for each row execute function "mp_ledger_entry_append_only"();
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`drop trigger if exists "mp_ledger_entry_no_update" on "mp_ledger_entry";`)
    this.addSql(`drop trigger if exists "mp_ledger_entry_no_delete" on "mp_ledger_entry";`)
    this.addSql(`drop function if exists "mp_ledger_entry_append_only"();`)
  }
}
