import { Kysely, sql } from 'kysely'

// Relocates the community-guidelines consent record from a single
// user-level flag (users.agreements, added in 0011/0012) to a per-
// membership record on session_users — one row per (user, session)
// joined, each carrying its own agreements snapshot. This makes every
// circle join its own auditable consent record (which circle, which
// keys, what timestamp) rather than one global flag with no per-join
// trail. A returning user who already agreed on some other session still
// isn't asked again — see sessionRepository.ts's copyPriorAgreementIfAny,
// which copies a prior agreement onto a new session's row instead of
// re-showing the modal.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('session_users')
    .addColumn('agreements', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .execute()

  await db.schema.alterTable('users').dropColumn('agreements').execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('users')
    .addColumn('agreements', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .execute()

  await db.schema.alterTable('session_users').dropColumn('agreements').execute()
}
