import { afterAll, describe, expect, test } from 'bun:test'
import { DEFAULT_LOCAL_DATABASE_URL, createDb, createPgPool, runMigrations } from '@mincirklen/shared'
import { joinSession, createSession as createSessionRepo } from './sessionRepository'
import { insertMessage, listMessages, recordFlaggedMessage, recordPassedMessage } from './messageRepository'

const pool = createPgPool(
  process.env.TEST_DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL,
  'test',
)
const db = createDb(pool)

await runMigrations(db, 'test')

afterAll(async () => {
  await db.destroy()
})

async function seedSessionWithUsers(count: number) {
  const session = await createSessionRepo(db)
  const userIds: string[] = []

  for (let i = 0; i < count; i++) {
    const user = await db.insertInto('users').defaultValues().returningAll().executeTakeFirstOrThrow()
    userIds.push(user.id)
    await joinSession(db, session.id, user.id)
  }

  return { sessionId: session.id, userIds }
}

describe('insertMessage / listMessages', () => {
  test('persists and lists messages in send order', async () => {
    const { sessionId, userIds } = await seedSessionWithUsers(1)

    await insertMessage(db, { sessionId, userId: userIds[0] as string, body: 'first' })
    await insertMessage(db, { sessionId, userId: userIds[0] as string, body: 'second' })

    const page = await listMessages(db, { sessionId, limit: 10 })
    expect(page.messages.map((m) => m.body)).toEqual(['first', 'second'])
  })
})

describe('recordPassedMessage', () => {
  // Turn advancement is no longer this function's concern — it's now
  // owned by websocket-service (see messageService.ts's explicit
  // advanceTurn dep call) — this only verifies the message itself
  // persists atomically with its moderation event.
  test('persists the message', async () => {
    const { sessionId, userIds } = await seedSessionWithUsers(2)

    const message = await recordPassedMessage(db, {
      sessionId,
      userId: userIds[0] as string,
      body: 'hello room',
    })

    expect(message.body).toBe('hello room')

    const page = await listMessages(db, { sessionId, limit: 10 })
    expect(page.messages).toHaveLength(1)
    expect(page.messages[0]?.body).toBe('hello room')
  })
})

describe('recordFlaggedMessage', () => {
  test('logs the flag without persisting a message', async () => {
    const { sessionId, userIds } = await seedSessionWithUsers(2)

    await recordFlaggedMessage(db, { sessionId, userId: userIds[0] as string })

    const page = await listMessages(db, { sessionId, limit: 10 })
    expect(page.messages).toHaveLength(0)
  })
})

describe('listMessages cursor pagination', () => {
  test('returns the most recent N messages, oldest-first, when no cursor is given', async () => {
    const { sessionId, userIds } = await seedSessionWithUsers(1)
    for (const body of ['one', 'two', 'three', 'four', 'five']) {
      await insertMessage(db, { sessionId, userId: userIds[0] as string, body })
    }

    const page = await listMessages(db, { sessionId, limit: 3 })
    expect(page.messages.map((m) => m.body)).toEqual(['three', 'four', 'five'])
    expect(page.nextCursor).not.toBeNull()
  })

  test('nextCursor pages strictly further into the past, with no gaps or duplicates', async () => {
    const { sessionId, userIds } = await seedSessionWithUsers(1)
    const bodies = ['one', 'two', 'three', 'four', 'five']
    for (const body of bodies) {
      await insertMessage(db, { sessionId, userId: userIds[0] as string, body })
    }

    const collected: string[] = []
    let cursor: string | undefined
    for (let guard = 0; guard < 10; guard++) {
      const page = await listMessages(db, { sessionId, cursor, limit: 2 })
      collected.unshift(...page.messages.map((m) => m.body))
      if (page.nextCursor === null) break
      cursor = page.nextCursor
    }

    expect(collected).toEqual(bodies)
  })

  test('nextCursor is null once the oldest message has been returned', async () => {
    const { sessionId, userIds } = await seedSessionWithUsers(1)
    await insertMessage(db, { sessionId, userId: userIds[0] as string, body: 'only one' })

    const page = await listMessages(db, { sessionId, limit: 10 })
    expect(page.nextCursor).toBeNull()
  })

  test('only returns messages for the given session', async () => {
    const a = await seedSessionWithUsers(1)
    const b = await seedSessionWithUsers(1)
    await insertMessage(db, { sessionId: a.sessionId, userId: a.userIds[0] as string, body: 'in a' })
    await insertMessage(db, { sessionId: b.sessionId, userId: b.userIds[0] as string, body: 'in b' })

    const page = await listMessages(db, { sessionId: a.sessionId, limit: 10 })
    expect(page.messages.map((m) => m.body)).toEqual(['in a'])
  })

  test('a cursor is never duplicated or skipped when two messages share the same millisecond', async () => {
    const { sessionId, userIds } = await seedSessionWithUsers(1)
    // Two inserts in the same statement land at the exact same
    // millisecond-resolution created_at more often than sequential
    // inserts would — exercising the (created_at, id) tie-break.
    await db
      .insertInto('messages')
      .values([
        { session_id: sessionId, user_id: userIds[0] as string, body: 'tie a' },
        { session_id: sessionId, user_id: userIds[0] as string, body: 'tie b' },
      ])
      .execute()
    await insertMessage(db, { sessionId, userId: userIds[0] as string, body: 'after' })

    const collected: string[] = []
    let cursor: string | undefined
    for (let guard = 0; guard < 10; guard++) {
      const page = await listMessages(db, { sessionId, cursor, limit: 1 })
      collected.unshift(...page.messages.map((m) => m.body))
      if (page.nextCursor === null) break
      cursor = page.nextCursor
    }

    expect(collected).toHaveLength(3)
    expect(new Set(collected).size).toBe(3)
  })
})
