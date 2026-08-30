import { Kysely, sql } from 'kysely'

// A key -> ISO8601-with-timezone-timestamp map, not one column/row per
// document — { "community_guidelines": "2026-08-27T12:34:56.789Z", ... }
// — so a future new checkbox/document (CommunityGuidelinesModal or
// elsewhere) just writes a new key, no migration required, while still
// keeping a real per-item timestamp for legal-record purposes. See
// repositories/userAgreementRepository.ts.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('users')
    .addColumn('agreements', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('users').dropColumn('agreements').execute()
}
