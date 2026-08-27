import { afterAll, describe, expect, test } from 'bun:test'
import { DEFAULT_LOCAL_DATABASE_URL, createDb, createPgPool, runMigrations } from '@mincirklen/shared'
import { getSessionState, joinSession, createSession as createSessionRepo } from './sessionRepository'
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

    const messages = await listMessages(db, sessionId)
    expect(messages.map((m) => m.body)).toEqual(['first', 'second'])
  })
})

describe('recordPassedMessage', () => {
  test('persists the message and advances the turn atomically', async () => {
    const { sessionId, userIds } = await seedSessionWithUsers(2)

    const message = await recordPassedMessage(db, {
      sessionId,
      userId: userIds[0] as string,
      body: 'hello room',
    })

    expect(message.body).toBe('hello room')

    const messages = await listMessages(db, sessionId)
    expect(messages).toHaveLength(1)

    const state = await getSessionState(db, sessionId)
    expect(state?.currentTurnUserId).toBe(userIds[1] as string)
  })
})

describe('recordFlaggedMessage', () => {
  test('advances the turn without persisting a message', async () => {
    const { sessionId, userIds } = await seedSessionWithUsers(2)

    await recordFlaggedMessage(db, { sessionId, userId: userIds[0] as string })

    const messages = await listMessages(db, sessionId)
    expect(messages).toHaveLength(0)

    const state = await getSessionState(db, sessionId)
    expect(state?.currentTurnUserId).toBe(userIds[1] as string)
  })
})
