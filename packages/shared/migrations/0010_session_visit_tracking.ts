import { Kysely, sql } from 'kysely'

// Backs the session dashboard's "recent sessions" sidebar (DashboardPage.tsx):
// visiting /s/:sessionId auto-joins the user (idempotent — see
// sessionRepository.ts's joinSession) and now also touches this column, so
// "sessions I've visited, most recent first" is just session_users ordered
// by last_visited_at — no separate visits table needed. Revisiting an
// already-joined session bumps it back to the top; the original join still
// only happens once.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('session_users').addColumn('last_visited_at', 'timestamptz').execute()

  // Backfill existing rows from joined_at (their only join = their only
  // visit so far) before tightening the column — using the schema
  // builder's own DEFAULT for this would evaluate now() once at ALTER
  // TABLE time for every existing row instead, which is wrong here.
  await sql`update session_users set last_visited_at = joined_at where last_visited_at is null`.execute(db)

  await sql`alter table session_users alter column last_visited_at set not null`.execute(db)
  await sql`alter table session_users alter column last_visited_at set default now()`.execute(db)

  // The recent-visits listing always filters by user_id and sorts by
  // last_visited_at desc — this index serves both in one pass.
  await db.schema
    .createIndex('session_users_user_id_last_visited_at_idx')
    .on('session_users')
    .columns(['user_id', 'last_visited_at'])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('session_users_user_id_last_visited_at_idx').execute()
  await db.schema.alterTable('session_users').dropColumn('last_visited_at').execute()
}
