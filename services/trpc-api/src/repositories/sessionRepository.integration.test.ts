import { afterAll, describe, expect, test } from 'bun:test'
import { createDb, createPgPool, runMigrations } from '@mincirklen/shared'
import {
  NotYourTurnError,
  SessionFullError,
  SessionNotFoundError,
  TurnAlreadyClaimedError,
  advanceTurn,
  claimTurn,
  createSession,
  getRoster,
  getSessionState,
  isSessionMember,
  joinSession,
  releaseTurnClaim,
} from './sessionRepository'

const pool = createPgPool(
  process.env.TEST_DATABASE_URL ?? 'postgres://mincirklen:mincirklen@localhost:5433/mincirklen',
  'test',
)
const db = createDb(pool)

await runMigrations(db, 'test')

afterAll(async () => {
  await db.destroy()
})

async function seedSessionWithUsers(count: number) {
  const session = await createSession(db)
  const userIds: string[] = []

  for (let i = 0; i < count; i++) {
    const user = await db.insertInto('users').defaultValues().returningAll().executeTakeFirstOrThrow()
    userIds.push(user.id)
    await joinSession(db, session.id, user.id)
  }

  return { sessionId: session.id, userIds }
}

describe('createSession', () => {
  test('creates a session in forming status with no current turn', async () => {
    const { id } = await createSession(db)
    const state = await getSessionState(db, id)

    expect(state?.status).toBe('forming')
    expect(state?.currentTurnUserId).toBeNull()
    expect(state?.roster).toEqual([])
  })
})

describe('joinSession', () => {
  test('assigns sequential turn order and activates on the first join', async () => {
    const { sessionId, userIds } = await seedSessionWithUsers(2)

    const roster = await getRoster(db, sessionId)
    expect(roster).toEqual([
      { userId: userIds[0], turnOrder: 0 },
      { userId: userIds[1], turnOrder: 1 },
    ])

    const state = await getSessionState(db, sessionId)
    expect(state?.status).toBe('active')
    expect(state?.currentTurnUserId).toBe(userIds[0])
  })

  test('is idempotent for a user who has already joined', async () => {
    const { sessionId, userIds } = await seedSessionWithUsers(1)

    const rejoin = await joinSession(db, sessionId, userIds[0] as string)
    expect(rejoin).toEqual({ userId: userIds[0], turnOrder: 0 })

    const roster = await getRoster(db, sessionId)
    expect(roster).toHaveLength(1)
  })

  test('rejects a join once the session is full', async () => {
    const { sessionId } = await seedSessionWithUsers(8)

    const extra = await db.insertInto('users').defaultValues().returningAll().executeTakeFirstOrThrow()
    await expect(joinSession(db, sessionId, extra.id)).rejects.toBeInstanceOf(SessionFullError)
  })

  test('rejects joining a session that does not exist', async () => {
    const user = await db.insertInto('users').defaultValues().returningAll().executeTakeFirstOrThrow()
    await expect(
      joinSession(db, '00000000-0000-0000-0000-000000000000', user.id),
    ).rejects.toBeInstanceOf(SessionNotFoundError)
  })
})

describe('isSessionMember', () => {
  test('reflects membership accurately', async () => {
    const { sessionId, userIds } = await seedSessionWithUsers(1)
    const outsider = await db.insertInto('users').defaultValues().returningAll().executeTakeFirstOrThrow()

    expect(await isSessionMember(db, sessionId, userIds[0] as string)).toBe(true)
    expect(await isSessionMember(db, sessionId, outsider.id)).toBe(false)
  })
})

describe('turn claiming and advancing', () => {
  test('claimTurn succeeds for the current-turn holder and rejects everyone else', async () => {
    const { sessionId, userIds } = await seedSessionWithUsers(2)

    await expect(claimTurn(db, sessionId, userIds[0] as string)).resolves.toBeUndefined()
    await releaseTurnClaim(db, sessionId)

    await expect(claimTurn(db, sessionId, userIds[1] as string)).rejects.toBeInstanceOf(NotYourTurnError)
  })

  test('claimTurn rejects a second concurrent claim while one is fresh', async () => {
    const { sessionId, userIds } = await seedSessionWithUsers(1)

    await claimTurn(db, sessionId, userIds[0] as string)
    await expect(claimTurn(db, sessionId, userIds[0] as string)).rejects.toBeInstanceOf(
      TurnAlreadyClaimedError,
    )
  })

  test('advanceTurn wraps around the roster and clears the claim', async () => {
    const { sessionId, userIds } = await seedSessionWithUsers(2)

    await claimTurn(db, sessionId, userIds[0] as string)
    await advanceTurn(db, sessionId)

    let state = await getSessionState(db, sessionId)
    expect(state?.currentTurnUserId).toBe(userIds[1] as string)

    await claimTurn(db, sessionId, userIds[1] as string)
    await advanceTurn(db, sessionId)

    state = await getSessionState(db, sessionId)
    expect(state?.currentTurnUserId).toBe(userIds[0] as string)

    // A fresh claim should succeed after advancing, proving the claim was cleared.
    await expect(claimTurn(db, sessionId, userIds[0] as string)).resolves.toBeUndefined()
  })
})
