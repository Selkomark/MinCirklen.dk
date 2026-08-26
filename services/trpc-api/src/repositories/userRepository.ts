import type { Database } from '@mincirklen/shared'
import type { Kysely } from 'kysely'

export async function insertUser(db: Kysely<Database>): Promise<{ id: string }> {
  const row = await db.insertInto('users').defaultValues().returningAll().executeTakeFirstOrThrow()
  return { id: row.id }
}

export async function touchUser(db: Kysely<Database>, userId: string): Promise<boolean> {
  const result = await db
    .updateTable('users')
    .set({ last_seen_at: new Date() })
    .where('id', '=', userId)
    .executeTakeFirst()

  return (result.numUpdatedRows ?? 0n) > 0n
}

export async function userExists(db: Kysely<Database>, userId: string): Promise<boolean> {
  const row = await db.selectFrom('users').select('id').where('id', '=', userId).executeTakeFirst()
  return row !== undefined
}
