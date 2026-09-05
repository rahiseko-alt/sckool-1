import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260902045213 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "ad_event" ("id" text not null, "placement_id" text not null, "kind" text check ("kind" in ('impression', 'click', 'conversion')) not null, "revenue" numeric not null, "raw_revenue" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ad_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ad_event_deleted_at" ON "ad_event" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ad_event_placement_id_kind" ON "ad_event" ("placement_id", "kind") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "ad_placement" ("id" text not null, "organization_id" text not null, "listing_id" text not null, "spend" numeric not null, "starts_at" timestamptz not null, "ends_at" timestamptz not null, "raw_spend" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ad_placement_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ad_placement_deleted_at" ON "ad_placement" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ad_placement_starts_at_ends_at" ON "ad_placement" ("starts_at", "ends_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ad_placement_organization_id" ON "ad_placement" ("organization_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "ad_event" cascade;`);

    this.addSql(`drop table if exists "ad_placement" cascade;`);
  }

}
