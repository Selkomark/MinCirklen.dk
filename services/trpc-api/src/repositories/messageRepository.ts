import type { Database } from '@mincirklen/shared'
import { sql, type Kysely } from 'kysely'
import { insertModerationEvent } from './moderationEventRepository'

export interface MessageRow {
  id: string
  sessionId: string
  userId: string
  body: string
  type: 'user' | 'system'
  createdAt: Date
}

function toMessageRow(row: {
  id: string
  session_id: string
  user_id: string
  body: string
  type: 'user' | 'system'
  created_at: Date
}): MessageRow {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    body: row.body,
    type: row.type,
    createdAt: row.created_at,
  }
}

// `type` defaults to 'user' — only sessionRouter.ts's join/visit call
// sites ever pass 'system', for the "X joined the circle" marker (see
// migrations/0001_init.ts). `body` is still NOT NULL for a
// system row; the frontend derives its own display text from `type` +
// `userId` and ignores body entirely for those.
export async function insertMessage(
  db: Kysely<Database>,
  params: { sessionId: string; userId: string; body: string; type?: 'user' | 'system' },
): Promise<MessageRow> {
  const row = await db
    .insertInto('messages')
    .values({ session_id: params.sessionId, user_id: params.userId, body: params.body, type: params.type ?? 'user' })
    .returningAll()
    .executeTakeFirstOrThrow()

  return toMessageRow(row)
}

export interface ListMessagesParams {
  sessionId: string
  // Omitted means "give me the latest page" — see the function doc
  // comment below for why that's the same query as any other page, not
  // a special case.
  cursor?: string
  limit: number
}

export interface ListMessagesResult {
  messages: MessageRow[]
  // Cursor to fetch the page of messages immediately OLDER than this
  // page's oldest row. Null means this page already reaches the start of
  // the session's history — nothing older exists.
  nextCursor: string | null
}

function parseMessageCursor(cursor: string): { value: string; id: string } {
  const [value, id] = cursor.split('|')
  if (value === undefined || !id) throw new Error(`invalid cursor: ${cursor}`)
  return { value, id }
}

// Unidirectional (see listMessagesInputSchema's doc comment) — unlike
// sessionRepository.ts's listOpenSessions, there's no `direction`. Every
// call is "the page immediately before this cursor," always queried
// newest-first (so LIMIT grabs the rows closest to the cursor) and
// reversed back to ascending/oldest-first — the natural chat reading
// order — before returning. Omitting the cursor is exactly the same
// query with no WHERE-cursor filter, which is also exactly "the latest
// page" — no synthetic anchor cursor needed the way listOpenSessions
// needs one to anchor its first fetch near "now".
export async function listMessages(db: Kysely<Database>, params: ListMessagesParams): Promise<ListMessagesResult> {
  let query = db
    .selectFrom('messages')
    .select([
      'id',
      'session_id',
      'user_id',
      'body',
      'type',
      'created_at',
      // Text form for the cursor, same precision rationale as
      // sessionRepository.ts's scheduled_at_cursor: created_at is
      // timestamptz (microsecond precision), while a JS Date round-trip
      // through toISOString() only has millisecond precision — that can
      // duplicate or skip a boundary row across pages. Postgres's own
      // text cast round-trips through ::timestamptz exactly.
      sql<string>`created_at::text`.as('created_at_cursor'),
    ])
    .where('session_id', '=', params.sessionId)

  if (params.cursor) {
    const decoded = parseMessageCursor(params.cursor)
    query = query.where(
      sql<boolean>`(created_at < ${decoded.value}::timestamptz) or (created_at = ${decoded.value}::timestamptz and id < ${decoded.id})`,
    )
  }

  const rows = await query.orderBy('created_at', 'desc').orderBy('id', 'desc').limit(params.limit + 1).execute()
  const hasMore = rows.length > params.limit
  const page = rows.slice(0, params.limit).reverse()
  const oldest = page[0]

  return {
    messages: page.map(toMessageRow),
    nextCursor: hasMore && oldest ? `${oldest.created_at_cursor}|${oldest.id}` : null,
  }
}

// Atomic: persist the message and log the passing classification — one
// transaction, so a failure partway through can't leave a moderation
// event without its message or vice versa. Turn advancement is no longer
// part of this transaction: that's now owned by websocket-service (Redis
// is the live authority — see adapters/redisTurnStateAdapter.ts on that
// side), and messageService.ts's sendMessage calls it explicitly via
// SendMessageDeps.advanceTurn after this resolves.
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
    return message
  })
}

// Logs the flag (message never persisted — held back). Turn advancement
// (a non-crisis flag still advances the turn, so it doesn't stall the
// room) is likewise now owned by websocket-service — see
// recordPassedMessage's comment above.
export async function recordFlaggedMessage(
  db: Kysely<Database>,
  params: { sessionId: string; userId: string },
): Promise<void> {
  await insertModerationEvent(db, {
    sessionId: params.sessionId,
    userId: params.userId,
    messageId: null,
    classification: 'flag',
  })
}
