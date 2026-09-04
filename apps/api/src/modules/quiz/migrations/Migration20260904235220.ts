import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260904235220 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "quiz" add column if not exists "translations" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "quiz" drop column if exists "translations";`);
  }

}
