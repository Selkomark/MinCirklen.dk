import { Kysely, sql } from 'kysely'

// Corrective follow-up to 0011_user_agreements: that file was rewritten
// in place (table -> jsonb column) *after* its table-based version had
// already run somewhere (this repo's own dev container auto-reruns
// migrations on every source save via `bun --watch`, so this bit
// immediately) — Kysely tracks applied migrations by filename, not
// content, so the rewrite silently never re-ran there, leaving a stale
// `user_agreements` table with no `users.agreements` column underneath
// code that expects one. Idempotent both ways (IF EXISTS / IF NOT
// EXISTS) so it's a no-op on an environment that only ever saw the
// current (jsonb) version of 0011 and never had the table at all.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('user_agreements').ifExists().execute()
  await sql`alter table users add column if not exists agreements jsonb not null default '{}'::jsonb`.execute(db)
}

export async function down(_db: Kysely<any>): Promise<void> {
  // Nothing to revert to — 0011's own down() already drops this column.
}
