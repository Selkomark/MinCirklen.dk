import type { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('sessions')
    .addColumn('current_turn_participant_id', 'uuid', (col) =>
      col.references('participants.id').onDelete('set null'),
    )
    .execute()

  await db.schema.alterTable('sessions').addColumn('turn_claimed_at', 'timestamptz').execute()

  await db.schema
    .alterTable('session_participants')
    .addUniqueConstraint('session_participants_session_turn_order_unique', ['session_id', 'turn_order'])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('session_participants')
    .dropConstraint('session_participants_session_turn_order_unique')
    .execute()

  await db.schema.alterTable('sessions').dropColumn('turn_claimed_at').execute()
  await db.schema.alterTable('sessions').dropColumn('current_turn_participant_id').execute()
}
