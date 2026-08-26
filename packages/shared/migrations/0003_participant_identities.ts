import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('participant_identities')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('participant_id', 'uuid', (col) => col.notNull().references('participants.id').onDelete('cascade'))
    .addColumn('provider', 'text', (col) => col.notNull())
    .addColumn('provider_subject_hash', 'text', (col) => col.notNull())
    .addColumn('linked_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('participant_identities_provider_subject_unique')
    .on('participant_identities')
    .columns(['provider', 'provider_subject_hash'])
    .unique()
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('participant_identities').execute()
}
