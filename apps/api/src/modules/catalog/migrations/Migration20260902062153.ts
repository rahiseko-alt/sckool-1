import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260902062153 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "listing_translation" drop constraint if exists "listing_translation_listing_id_locale_code_unique";`);
    this.addSql(`create table if not exists "listing_translation" ("id" text not null, "listing_id" text not null, "locale_code" text not null, "title" text not null, "description" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "listing_translation_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_listing_translation_deleted_at" ON "listing_translation" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_listing_translation_listing_id_locale_code_unique" ON "listing_translation" ("listing_id", "locale_code") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "listing_translation" cascade;`);
  }

}
