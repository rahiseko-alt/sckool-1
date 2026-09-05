import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260902045830 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "mp_ledger_entry" add column if not exists "group_id" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "mp_ledger_entry" drop column if exists "group_id";`);
  }

}
