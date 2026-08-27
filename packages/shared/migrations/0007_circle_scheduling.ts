import { Kysely, sql } from 'kysely'

// Backs the "topic" chips/filter on the /start/new and /start/join pages
// (previously a hardcoded array) with a real table so a future admin UI
// can manage the list without a deploy. Seeded with today's six topics so
// existing UI copy keeps working unchanged.
//
// The four new `sessions` columns are nullable rather than backfilled +
// NOT NULL: `createSession(db)` is called with no scheduling info all
// over the existing ad-hoc turn-based flow (tests and
// packages/shared/src/db/seed.ts), which must keep working unchanged.
// Only sessions created through the new scheduled-circle flow populate
// them — see services/trpc-api/src/repositories/sessionRepository.ts.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('topics')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('slug', 'text', (col) => col.notNull().unique())
    .addColumn('label', 'text', (col) => col.notNull())
    .addColumn('sort_order', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('is_active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db
    .insertInto('topics')
    .values([
      { slug: 'grief', label: 'Grief', sort_order: 0 },
      { slug: 'anxiety', label: 'Anxiety', sort_order: 1 },
      { slug: 'parenting', label: 'New parents', sort_order: 2 },
      { slug: 'chronic', label: 'Chronic illness', sort_order: 3 },
      { slug: 'career', label: 'Career transitions', sort_order: 4 },
      { slug: 'sleep', label: 'Sleep and insomnia', sort_order: 5 },
    ])
    .onConflict((oc) => oc.column('slug').doNothing())
    .execute()

  await db.schema
    .alterTable('sessions')
    .addColumn('topic_id', 'uuid', (col) => col.references('topics.id'))
    .execute()
  await db.schema.alterTable('sessions').addColumn('scheduled_at', 'timestamptz').execute()
  await db.schema.alterTable('sessions').addColumn('duration_minutes', 'integer').execute()
  await db.schema.alterTable('sessions').addColumn('capacity', 'integer').execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('sessions').dropColumn('capacity').execute()
  await db.schema.alterTable('sessions').dropColumn('duration_minutes').execute()
  await db.schema.alterTable('sessions').dropColumn('scheduled_at').execute()
  await db.schema.alterTable('sessions').dropColumn('topic_id').execute()

  await db.schema.dropTable('topics').execute()
}
