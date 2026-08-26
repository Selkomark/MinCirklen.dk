import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('participants')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('last_seen_at', 'timestamptz')
    .execute()

  await db.schema
    .createTable('sessions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('forming'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('started_at', 'timestamptz')
    .addColumn('ended_at', 'timestamptz')
    .addCheckConstraint('sessions_status_check', sql`status in ('forming','active','completed','cancelled')`)
    .execute()

  await db.schema
    .createTable('session_participants')
    .addColumn('session_id', 'uuid', (col) => col.notNull().references('sessions.id').onDelete('cascade'))
    .addColumn('participant_id', 'uuid', (col) => col.notNull().references('participants.id').onDelete('cascade'))
    .addColumn('joined_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('left_at', 'timestamptz')
    .addColumn('turn_order', 'integer')
    .addPrimaryKeyConstraint('session_participants_pk', ['session_id', 'participant_id'])
    .execute()

  await db.schema
    .createTable('messages')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('session_id', 'uuid', (col) => col.notNull().references('sessions.id').onDelete('cascade'))
    .addColumn('participant_id', 'uuid', (col) => col.notNull().references('participants.id').onDelete('cascade'))
    .addColumn('body', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('messages_session_id_created_at_idx')
    .on('messages')
    .columns(['session_id', 'created_at'])
    .execute()

  await db.schema
    .createTable('moderation_events')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('session_id', 'uuid', (col) => col.notNull().references('sessions.id').onDelete('cascade'))
    .addColumn('participant_id', 'uuid', (col) => col.notNull().references('participants.id').onDelete('cascade'))
    .addColumn('message_id', 'uuid', (col) => col.references('messages.id').onDelete('set null'))
    .addColumn('classification', 'text', (col) => col.notNull())
    .addColumn('human_reviewed', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('human_review_outcome', 'text')
    .addColumn('reviewed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('moderation_events_classification_check', sql`classification in ('pass','flag','crisis')`)
    .addCheckConstraint(
      'moderation_events_review_outcome_check',
      sql`human_review_outcome in ('true_positive','false_positive','true_negative','false_negative')`,
    )
    .execute()

  await db.schema
    .createTable('feedback_ratings')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('session_id', 'uuid', (col) => col.notNull().references('sessions.id').onDelete('cascade'))
    .addColumn('participant_id', 'uuid', (col) => col.notNull().references('participants.id').onDelete('cascade'))
    .addColumn('rating', 'smallint', (col) => col.notNull())
    .addColumn('free_text', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('feedback_ratings_rating_check', sql`rating between 1 and 5`)
    .addUniqueConstraint('feedback_ratings_session_participant_unique', ['session_id', 'participant_id'])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('feedback_ratings').execute()
  await db.schema.dropTable('moderation_events').execute()
  await db.schema.dropTable('messages').execute()
  await db.schema.dropTable('session_participants').execute()
  await db.schema.dropTable('sessions').execute()
  await db.schema.dropTable('participants').execute()
}
