import type { Database } from '@mincirklen/shared'
import type { Kysely } from 'kysely'
import { advanceTurn } from './sessionRepository'
import { insertModerationEvent } from './moderationEventRepository'

export interface MessageRow {
  id: string
  sessionId: string
  userId: string
  body: string
  createdAt: Date
}

function toMessageRow(row: {
  id: string
  session_id: string
  user_id: string
  body: string
  created_at: Date
}): MessageRow {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    body: row.body,
    createdAt: row.created_at,
  }
}

export async function insertMessage(
  db: Kysely<Database>,
  params: { sessionId: string; userId: string; body: string },
): Promise<MessageRow> {
  const row = await db
    .insertInto('messages')
    .values({ session_id: params.sessionId, user_id: params.userId, body: params.body })
    .returningAll()
    .executeTakeFirstOrThrow()

  return toMessageRow(row)
}

export async function listMessages(db: Kysely<Database>, sessionId: string): Promise<MessageRow[]> {
  const rows = await db
    .selectFrom('messages')
    .selectAll()
    .where('session_id', '=', sessionId)
    .orderBy('created_at', 'asc')
    .execute()

  return rows.map(toMessageRow)
}

// Atomic: persist the message, log the passing classification, and hand
// the turn to the next user — all in one transaction, so a failure
// partway through can't leave the room in a state where a message exists
// but the turn never advanced (or vice versa).
export async function recordPassedMessage(
  db: Kysely<Database>,
  params: { sessionId: string; userId: string; body: string },
): Promise<MessageRow> {
  return db.transaction().execute(async (trx) => {
    const message = await insertMessage(trx, params)
    await insertModerationEvent(trx, {
      sessionId: params.sessionId,
      userId: params.userId,
      messageId: message.id,
      classification: 'pass',
    })
    await advanceTurn(trx, params.sessionId)
    return message
  })
}

// Atomic: log the flag (message never persisted — held back) and still
// advance the turn, so a non-crisis flag doesn't stall the room.
export async function recordFlaggedMessage(
  db: Kysely<Database>,
  params: { sessionId: string; userId: string },
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await insertModerationEvent(trx, {
      sessionId: params.sessionId,
      userId: params.userId,
      messageId: null,
      classification: 'flag',
    })
    await advanceTurn(trx, params.sessionId)
  })
}
