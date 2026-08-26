import { Kysely, sql } from 'kysely'

// Collected by the post-login registration page (RegisterPage.tsx) —
// kept in its own table rather than on `users` because it's optional,
// opt-in identity info (Charter §4: anonymity by default), not a
// property of every account.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('user_profiles')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().unique().references('users.id').onDelete('cascade'))
    .addColumn('first_name', 'text', (col) => col.notNull())
    .addColumn('last_name', 'text', (col) => col.notNull())
    .addColumn('country', 'text', (col) => col.notNull())
    .addColumn('mobile_number', 'text', (col) => col.notNull())
    .addColumn('stay_anonymous', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('terms_accepted_at', 'timestamptz', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('user_profiles').execute()
}
