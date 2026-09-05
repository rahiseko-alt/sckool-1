import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260902044801 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "quiz" ("id" text not null, "title" text not null, "topic" text not null, "questions" jsonb not null, "reward_tiers" jsonb not null, "bonus_valid_days" integer not null, "is_open" boolean not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "quiz_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_quiz_deleted_at" ON "quiz" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "quiz_attempt" ("id" text not null, "quiz_id" text not null, "organization_id" text not null, "score" integer not null, "reward_amount" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "quiz_attempt_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_quiz_attempt_deleted_at" ON "quiz_attempt" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_quiz_attempt_quiz_id_organization_id" ON "quiz_attempt" ("quiz_id", "organization_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "quiz" cascade;`);

    this.addSql(`drop table if exists "quiz_attempt" cascade;`);
  }

}
