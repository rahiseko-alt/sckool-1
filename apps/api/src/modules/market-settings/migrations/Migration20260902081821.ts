import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260902081821 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "market_setting" drop constraint if exists "market_setting_key_unique";`);
    this.addSql(`create table if not exists "market_setting" ("id" text not null, "key" text not null, "value" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "market_setting_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_market_setting_deleted_at" ON "market_setting" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_market_setting_key_unique" ON "market_setting" ("key") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "market_setting" cascade;`);
  }

}
