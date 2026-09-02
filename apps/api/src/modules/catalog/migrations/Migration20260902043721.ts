import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260902043721 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "listing" ("id" text not null, "organization_id" text not null, "title" text not null, "description" text not null, "target_customer" text not null, "problem_solved" text not null, "price" numeric not null, "available_quantity" integer not null, "image_url" text not null, "sale_starts_at" timestamptz not null, "sale_ends_at" timestamptz not null, "raw_price" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "listing_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_listing_deleted_at" ON "listing" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_listing_sale_starts_at_sale_ends_at" ON "listing" ("sale_starts_at", "sale_ends_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_listing_organization_id" ON "listing" ("organization_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "listing" cascade;`);
  }

}
