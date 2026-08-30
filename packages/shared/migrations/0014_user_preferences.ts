import type { Kysely } from 'kysely'

// Nullable, plaintext columns — same category as `country`/`stay_anonymous`
// (see migrations/0006_encrypt_user_profile_pii.ts: "low sensitivity on
// their own, useful for aggregate reporting"), no KMS involvement. `null`
// is a meaningful value for both, not just "unset": for `language` it
// means "fall back to detected/browser language," for `timezone` it means
// "use the system/browser timezone" rather than a specific stored one.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('user_profiles').addColumn('language', 'text').execute()
  await db.schema.alterTable('user_profiles').addColumn('timezone', 'text').execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('user_profiles').dropColumn('timezone').execute()
  await db.schema.alterTable('user_profiles').dropColumn('language').execute()
}
