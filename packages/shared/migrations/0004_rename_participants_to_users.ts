import { Kysely, sql } from 'kysely'

// Product terminology shifted from "participant" to "user" — this renames
// the tables/columns/constraints in place rather than editing the
// migrations that created them, so existing databases upgrade instead of
// rebuilding. Auto-generated foreign-key constraint names (e.g.
// `session_participants_participant_id_fkey`) are left as Postgres
// created them — cosmetic only, not worth guessing at for a rename.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('participants').renameTo('users').execute()
  await db.schema.alterTable('session_participants').renameTo('session_users').execute()
  await db.schema.alterTable('participant_identities').renameTo('user_identities').execute()

  await db.schema.alterTable('session_users').renameColumn('participant_id', 'user_id').execute()
  await db.schema.alterTable('messages').renameColumn('participant_id', 'user_id').execute()
  await db.schema.alterTable('moderation_events').renameColumn('participant_id', 'user_id').execute()
  await db.schema.alterTable('feedback_ratings').renameColumn('participant_id', 'user_id').execute()
  await db.schema.alterTable('user_identities').renameColumn('participant_id', 'user_id').execute()
  await db.schema.alterTable('sessions').renameColumn('current_turn_participant_id', 'current_turn_user_id').execute()

  await sql`alter table session_users rename constraint session_participants_pk to session_users_pk`.execute(db)
  await sql`alter table session_users rename constraint session_participants_session_turn_order_unique to session_users_session_turn_order_unique`.execute(
    db,
  )
  await sql`alter table feedback_ratings rename constraint feedback_ratings_session_participant_unique to feedback_ratings_session_user_unique`.execute(
    db,
  )
  await sql`alter index participant_identities_provider_subject_unique rename to user_identities_provider_subject_unique`.execute(
    db,
  )
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter index user_identities_provider_subject_unique rename to participant_identities_provider_subject_unique`.execute(
    db,
  )
  await sql`alter table feedback_ratings rename constraint feedback_ratings_session_user_unique to feedback_ratings_session_participant_unique`.execute(
    db,
  )
  await sql`alter table session_users rename constraint session_users_session_turn_order_unique to session_participants_session_turn_order_unique`.execute(
    db,
  )
  await sql`alter table session_users rename constraint session_users_pk to session_participants_pk`.execute(db)

  await db.schema.alterTable('sessions').renameColumn('current_turn_user_id', 'current_turn_participant_id').execute()
  await db.schema.alterTable('user_identities').renameColumn('user_id', 'participant_id').execute()
  await db.schema.alterTable('feedback_ratings').renameColumn('user_id', 'participant_id').execute()
  await db.schema.alterTable('moderation_events').renameColumn('user_id', 'participant_id').execute()
  await db.schema.alterTable('messages').renameColumn('user_id', 'participant_id').execute()
  await db.schema.alterTable('session_users').renameColumn('user_id', 'participant_id').execute()

  await db.schema.alterTable('user_identities').renameTo('participant_identities').execute()
  await db.schema.alterTable('session_users').renameTo('session_participants').execute()
  await db.schema.alterTable('users').renameTo('participants').execute()
}
