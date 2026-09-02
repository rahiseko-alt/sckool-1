import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260902042510 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "organization" drop constraint if exists "organization_name_unique";`);
    this.addSql(`alter table if exists "organization" drop constraint if exists "organization_market_id_unique";`);
    this.addSql(`create table if not exists "organization" ("id" text not null, "market_id" text not null, "name" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "organization_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_organization_deleted_at" ON "organization" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_organization_market_id_unique" ON "organization" ("market_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_organization_name_unique" ON "organization" ("name") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "organization" cascade;`);
  }

}
