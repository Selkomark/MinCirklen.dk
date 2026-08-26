import { MAX_USERS_PER_SESSION, TURN_CLAIM_STALE_AFTER_SECONDS, isSessionMember, type Database } from '@mincirklen/shared'
import type { Kysely } from 'kysely'

export { isSessionMember }

// Explicit constructors here (rather than relying on the implicit default)
// so Bun's coverage instrumentation actually tracks these as invoked —
// an empty `class X extends Error {}` body otherwise counts as a
// permanently-uncovered function regardless of how many times `new X()`
// runs.
export class SessionNotFoundError extends Error {
  constructor(message: string) {
    super(message)
  }
}
export class SessionFullError extends Error {
  constructor(message: string) {
    super(message)
  }
}
export class NotYourTurnError extends Error {
  constructor(message: string) {
    super(message)
  }
}
export class TurnAlreadyClaimedError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export interface RosterEntry {
  userId: string
  turnOrder: number
}

export interface SessionState {
  id: string
  status: 'forming' | 'active' | 'completed' | 'cancelled'
  currentTurnUserId: string | null
  roster: RosterEntry[]
}

export async function createSession(db: Kysely<Database>): Promise<{ id: string }> {
  const row = await db.insertInto('sessions').defaultValues().returningAll().executeTakeFirstOrThrow()
  return { id: row.id }
}

export async function getRoster(db: Kysely<Database>, sessionId: string): Promise<RosterEntry[]> {
  const rows = await db
    .selectFrom('session_users')
    .select(['user_id', 'turn_order'])
    .where('session_id', '=', sessionId)
    .orderBy('turn_order', 'asc')
    .execute()

  return rows
    .filter((row) => row.turn_order !== null)
    .map((row) => ({ userId: row.user_id, turnOrder: row.turn_order as number }))
}

export async function getSessionState(db: Kysely<Database>, sessionId: string): Promise<SessionState | null> {
  const session = await db
    .selectFrom('sessions')
    .select(['id', 'status', 'current_turn_user_id'])
    .where('id', '=', sessionId)
    .executeTakeFirst()

  if (!session) return null

  const roster = await getRoster(db, sessionId)

  return {
    id: session.id,
    status: session.status,
    currentTurnUserId: session.current_turn_user_id,
    roster,
  }
}

export async function joinSession(
  db: Kysely<Database>,
  sessionId: string,
  userId: string,
): Promise<RosterEntry> {
  return db.transaction().execute(async (trx) => {
    const session = await trx
      .selectFrom('sessions')
      .select('id')
      .where('id', '=', sessionId)
      .forUpdate()
      .executeTakeFirst()

    if (!session) {
      throw new SessionNotFoundError(`session ${sessionId} not found`)
    }

    const roster = await getRoster(trx, sessionId)
    const existing = roster.find((entry) => entry.userId === userId)
    if (existing) {
      return existing
    }

    if (roster.length >= MAX_USERS_PER_SESSION) {
      throw new SessionFullError(`session ${sessionId} is full`)
    }

    const turnOrder = roster.length

    await trx
      .insertInto('session_users')
      .values({ session_id: sessionId, user_id: userId, turn_order: turnOrder })
      .execute()

    if (turnOrder === 0) {
      await trx
        .updateTable('sessions')
        .set({ status: 'active', current_turn_user_id: userId })
        .where('id', '=', sessionId)
        .execute()
    }

    return { userId, turnOrder }
  })
}

export async function claimTurn(db: Kysely<Database>, sessionId: string, userId: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const session = await trx
      .selectFrom('sessions')
      .select(['current_turn_user_id', 'turn_claimed_at'])
      .where('id', '=', sessionId)
      .forUpdate()
      .executeTakeFirst()

    if (!session) {
      throw new SessionNotFoundError(`session ${sessionId} not found`)
    }

    if (session.current_turn_user_id !== userId) {
      throw new NotYourTurnError(`user ${userId} does not hold the turn for session ${sessionId}`)
    }

    if (session.turn_claimed_at) {
      const ageSeconds = (Date.now() - session.turn_claimed_at.getTime()) / 1000
      if (ageSeconds < TURN_CLAIM_STALE_AFTER_SECONDS) {
        throw new TurnAlreadyClaimedError(`turn for session ${sessionId} is already claimed`)
      }
    }

    await trx.updateTable('sessions').set({ turn_claimed_at: new Date() }).where('id', '=', sessionId).execute()
  })
}

export async function releaseTurnClaim(db: Kysely<Database>, sessionId: string): Promise<void> {
  await db.updateTable('sessions').set({ turn_claimed_at: null }).where('id', '=', sessionId).execute()
}

export async function advanceTurn(db: Kysely<Database>, sessionId: string): Promise<void> {
  const roster = await getRoster(db, sessionId)
  if (roster.length === 0) return

  const session = await db
    .selectFrom('sessions')
    .select('current_turn_user_id')
    .where('id', '=', sessionId)
    .executeTakeFirst()

  const currentIndex = roster.findIndex((entry) => entry.userId === session?.current_turn_user_id)
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % roster.length
  const next = roster[nextIndex]

  await db
    .updateTable('sessions')
    .set({ current_turn_user_id: next?.userId ?? null, turn_claimed_at: null })
    .where('id', '=', sessionId)
    .execute()
}
