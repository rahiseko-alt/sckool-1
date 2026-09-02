import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260902041510 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "mp_ledger_entry" ("id" text not null, "organization_id" text not null, "amount" numeric not null, "kind" text check ("kind" in ('initial_grant', 'bonus_grant', 'bonus_expired', 'purchase', 'sale', 'ad_spend', 'reversal')) not null, "pocket" text check ("pocket" in ('normal', 'bonus')) not null, "expires_at" timestamptz null, "reference" text null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mp_ledger_entry_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_ledger_entry_deleted_at" ON "mp_ledger_entry" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "mp_ledger_entry" cascade;`);
  }

}
