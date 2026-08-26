import type { Kysely } from 'kysely'

// first_name/last_name/mobile_number are genuinely identifying PII —
// collapsed into a single ciphertext column, encrypted application-side
// (services/trpc-api/src/adapters/kmsAdapter.ts, via Vault's Transit
// engine locally / a cloud KMS in prod) before it ever reaches Postgres.
// country and stay_anonymous stay plaintext — low sensitivity on their
// own, and useful for aggregate reporting.
//
// Assumes `user_profiles` is empty at migration time (true pre-launch —
// there's no real user data yet). down() restores the old column shape
// but can't recover plaintext from ciphertext, so reversing this on a
// database with real rows will fail the NOT NULL backfill below; that's
// an accepted limitation of a schema-shape-only reversal, same spirit as
// migration 0004's note on not chasing auto-generated FK names.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('user_profiles')
    .addColumn('pii_ciphertext', 'text', (col) => col.notNull())
    .execute()

  await db.schema.alterTable('user_profiles').dropColumn('first_name').execute()
  await db.schema.alterTable('user_profiles').dropColumn('last_name').execute()
  await db.schema.alterTable('user_profiles').dropColumn('mobile_number').execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('user_profiles').addColumn('first_name', 'text', (col) => col.notNull()).execute()
  await db.schema.alterTable('user_profiles').addColumn('last_name', 'text', (col) => col.notNull()).execute()
  await db.schema.alterTable('user_profiles').addColumn('mobile_number', 'text', (col) => col.notNull()).execute()

  await db.schema.alterTable('user_profiles').dropColumn('pii_ciphertext').execute()
}
