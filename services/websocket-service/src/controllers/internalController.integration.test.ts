import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { DEFAULT_LOCAL_DATABASE_URL, createDb, createPgPool, presenceSubject, runMigrations } from '@mincirklen/shared'
import { Redis } from 'ioredis'
import { connect, type NatsConnection } from 'nats'
import { createApp } from '../app'

const AUTH_SECRET = 'internal-controller-integration-test-secret'
const INTERNAL_SERVICE_SECRET = 'internal-controller-integration-test-internal-secret'
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222'

const pool = createPgPool(process.env.TEST_DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL, 'test')
const db = createDb(pool)

let redis: Redis
let nats: NatsConnection
let server: ReturnType<typeof Bun.serve>
// A second server sharing the same Redis/NATS but wired to an already-
// destroyed Postgres pool — every query against it rejects immediately.
// Used only to exercise the fire-and-forget write-back's catch branch
// (createClaimTurnHandler/createAdvanceTurnHandler): the claim/advance
// itself must still succeed (Redis is authoritative), and the swallowed
// Postgres failure must never surface to the caller.
let brokenDbPool: ReturnType<typeof createPgPool>
let brokenDbServer: ReturnType<typeof Bun.serve>

beforeAll(async () => {
  await runMigrations(db, 'test')
  redis = new Redis(REDIS_URL)
  nats = await connect({ servers: NATS_URL })

  const app = createApp({ db, nats, redis, authSecret: AUTH_SECRET, allowedOrigins: [], internalServiceSecret: INTERNAL_SERVICE_SECRET, wireFormat: 'json' })
  server = Bun.serve({ port: 0, fetch: app.fetch })

  brokenDbPool = createPgPool(process.env.TEST_DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL, 'test')
  const brokenDb = createDb(brokenDbPool)
  await brokenDbPool.end()
  const brokenApp = createApp({
    db: brokenDb,
    nats,
    redis,
    authSecret: AUTH_SECRET,
    allowedOrigins: [],
    internalServiceSecret: INTERNAL_SERVICE_SECRET,
    wireFormat: 'json',
  })
  brokenDbServer = Bun.serve({ port: 0, fetch: brokenApp.fetch })
})

afterAll(async () => {
  server.stop(true)
  brokenDbServer.stop(true)
  redis.disconnect()
  await nats.close()
  await db.destroy()
})

function url(path: string): string {
  return `http://localhost:${server.port}${path}`
}

async function post(path: string, body?: unknown): Promise<Response> {
  return fetch(url(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL_SERVICE_SECRET },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function get(path: string): Promise<Response> {
  return fetch(url(path), { headers: { 'x-internal-secret': INTERNAL_SERVICE_SECRET } })
}

async function postWithBrokenDb(path: string, body?: unknown): Promise<Response> {
  return fetch(`http://localhost:${brokenDbServer.port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL_SERVICE_SECRET },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

// A second, independent NATS connection standing in for a connected
// client's own subscription (mirroring app.integration.test.ts's
// cross-pod pattern) — proves the presence events these handlers publish
// actually reach a real subscriber, not just that publish() was called.
async function collectPresenceEvents(sessionId: string, count: number): Promise<Record<string, unknown>[]> {
  const subscriberNats = await connect({ servers: NATS_URL })
  const sub = subscriberNats.subscribe(presenceSubject(sessionId))
  const events: Record<string, unknown>[] = []
  for await (const msg of sub) {
    events.push(JSON.parse(msg.string()) as Record<string, unknown>)
    if (events.length >= count) break
  }
  await subscriberNats.close()
  return events
}

async function seedSession(members: { turnOrder: number }[]): Promise<{ sessionId: string; userIds: string[] }> {
  const users = await Promise.all(members.map(() => db.insertInto('users').defaultValues().returningAll().executeTakeFirstOrThrow()))
  const session = await db
    .insertInto('sessions')
    .values({ status: 'active', current_turn_user_id: users[0]?.id ?? null })
    .returningAll()
    .executeTakeFirstOrThrow()
  if (users.length > 0) {
    await db
      .insertInto('session_users')
      .values(users.map((u, i) => ({ session_id: session.id, user_id: u.id, turn_order: i })))
      .execute()
  }
  return { sessionId: session.id, userIds: users.map((u) => u.id) }
}

describe('internal turn/roster routes — require the internal secret', () => {
  test('rejects with 403 when the secret header is missing', async () => {
    const { sessionId } = await seedSession([{ turnOrder: 0 }])
    const res = await fetch(url(`/internal/sessions/${sessionId}/turn`))
    expect(res.status).toBe(403)
  })
})

describe('GET /internal/sessions/:id/turn', () => {
  test('seeds from Postgres on first touch and returns the turn state, with nobody online yet', async () => {
    const { sessionId, userIds } = await seedSession([{ turnOrder: 0 }, { turnOrder: 1 }])

    const res = await get(`/internal/sessions/${sessionId}/turn`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      currentTurnUserId: string
      roster: { userId: string; turnOrder: number }[]
      onlineUserIds: string[]
    }
    expect(body.currentTurnUserId).toBe(userIds[0])
    expect(body.roster).toEqual([
      { userId: userIds[0], turnOrder: 0 },
      { userId: userIds[1], turnOrder: 1 },
    ])
    expect(body.onlineUserIds).toEqual([])
  })

  test('returns 404 for a session that does not exist anywhere', async () => {
    const res = await get(`/internal/sessions/${crypto.randomUUID()}/turn`)
    expect(res.status).toBe(404)
  })

  test('includes a member as online once their presence has been marked in Redis', async () => {
    const { sessionId, userIds } = await seedSession([{ turnOrder: 0 }, { turnOrder: 1 }])
    await redis.zadd(`session:${sessionId}:online`, Date.now(), userIds[0] as string)

    const res = await get(`/internal/sessions/${sessionId}/turn`)
    const body = (await res.json()) as { onlineUserIds: string[] }
    expect(body.onlineUserIds).toEqual([userIds[0]])
  })
})

describe('POST /internal/sessions/:id/roster/join', () => {
  test('adds a new member to an already-seeded session without disturbing the turn cursor', async () => {
    const { sessionId, userIds } = await seedSession([{ turnOrder: 0 }])
    await get(`/internal/sessions/${sessionId}/turn`) // force the initial seed

    const newUser = await db.insertInto('users').defaultValues().returningAll().executeTakeFirstOrThrow()
    await db.insertInto('session_users').values({ session_id: sessionId, user_id: newUser.id, turn_order: 1 }).execute()

    const joinRes = await post(`/internal/sessions/${sessionId}/roster/join`, { userId: newUser.id, turnOrder: 1 })
    expect(joinRes.status).toBe(204)

    const stateRes = await get(`/internal/sessions/${sessionId}/turn`)
    const body = (await stateRes.json()) as { currentTurnUserId: string; roster: { userId: string }[] }
    expect(body.currentTurnUserId).toBe(userIds[0])
    expect(body.roster.map((r) => r.userId)).toEqual([userIds[0], newUser.id])
  })

  test('rejects a malformed body with 400', async () => {
    const { sessionId } = await seedSession([{ turnOrder: 0 }])
    const res = await post(`/internal/sessions/${sessionId}/roster/join`, { userId: 123 })
    expect(res.status).toBe(400)
  })

  test('404s for a session that does not exist in Postgres either', async () => {
    const res = await post(`/internal/sessions/${crypto.randomUUID()}/roster/join`, { userId: crypto.randomUUID(), turnOrder: 0 })
    expect(res.status).toBe(404)
  })

  test('publishes participant-joined and roster-update presence events reachable by a real subscriber', async () => {
    const { sessionId, userIds } = await seedSession([{ turnOrder: 0 }])
    await get(`/internal/sessions/${sessionId}/turn`) // force the initial seed

    const newUser = await db.insertInto('users').defaultValues().returningAll().executeTakeFirstOrThrow()
    await db.insertInto('session_users').values({ session_id: sessionId, user_id: newUser.id, turn_order: 1 }).execute()

    const events = collectPresenceEvents(sessionId, 2)
    await new Promise((r) => setTimeout(r, 100)) // let the subscription actually land before publishing
    await post(`/internal/sessions/${sessionId}/roster/join`, { userId: newUser.id, turnOrder: 1 })

    const [joined, rosterUpdate] = await events
    expect(joined).toEqual({ type: 'participant-joined', sessionId, userId: newUser.id, turnOrder: 1 })
    expect(rosterUpdate).toEqual({
      type: 'roster-update',
      sessionId,
      currentTurnUserId: userIds[0],
      roster: [
        { userId: userIds[0], turnOrder: 0 },
        { userId: newUser.id, turnOrder: 1 },
      ],
    })
  })
})

describe('POST /internal/sessions/:id/turn/claim', () => {
  test('rejects a malformed body with 400', async () => {
    const { sessionId } = await seedSession([{ turnOrder: 0 }])
    const res = await post(`/internal/sessions/${sessionId}/turn/claim`, { userId: 123 })
    expect(res.status).toBe(400)
  })

  test('204s for the current turn holder and mirrors the claim back to Postgres', async () => {
    const { sessionId, userIds } = await seedSession([{ turnOrder: 0 }])
    await get(`/internal/sessions/${sessionId}/turn`)

    const res = await post(`/internal/sessions/${sessionId}/turn/claim`, { userId: userIds[0] })
    expect(res.status).toBe(204)

    await new Promise((r) => setTimeout(r, 100)) // fire-and-forget write-back
    const row = await db.selectFrom('sessions').select('turn_claimed_at').where('id', '=', sessionId).executeTakeFirstOrThrow()
    expect(row.turn_claimed_at).not.toBeNull()
  })

  test('403s for anyone who does not hold the turn', async () => {
    const { sessionId, userIds } = await seedSession([{ turnOrder: 0 }, { turnOrder: 1 }])
    await get(`/internal/sessions/${sessionId}/turn`)

    const res = await post(`/internal/sessions/${sessionId}/turn/claim`, { userId: userIds[1] })
    expect(res.status).toBe(403)
  })

  test('409s for a second claim while one is already outstanding', async () => {
    const { sessionId, userIds } = await seedSession([{ turnOrder: 0 }])
    await get(`/internal/sessions/${sessionId}/turn`)

    await post(`/internal/sessions/${sessionId}/turn/claim`, { userId: userIds[0] })
    const res = await post(`/internal/sessions/${sessionId}/turn/claim`, { userId: userIds[0] })
    expect(res.status).toBe(409)
  })

  test('404s for a session with no seeded turn state at all', async () => {
    const res = await post(`/internal/sessions/${crypto.randomUUID()}/turn/claim`, { userId: crypto.randomUUID() })
    expect(res.status).toBe(404)
  })

  test('still 204s even when the fire-and-forget Postgres write-back fails', async () => {
    const { sessionId, userIds } = await seedSession([{ turnOrder: 0 }])
    await get(`/internal/sessions/${sessionId}/turn`)

    const res = await postWithBrokenDb(`/internal/sessions/${sessionId}/turn/claim`, { userId: userIds[0] })
    expect(res.status).toBe(204)
  })
})

describe('POST /internal/sessions/:id/turn/release', () => {
  test('204s and lets a subsequent claim succeed immediately', async () => {
    const { sessionId, userIds } = await seedSession([{ turnOrder: 0 }])
    await get(`/internal/sessions/${sessionId}/turn`)
    await post(`/internal/sessions/${sessionId}/turn/claim`, { userId: userIds[0] })

    const releaseRes = await post(`/internal/sessions/${sessionId}/turn/release`)
    expect(releaseRes.status).toBe(204)

    const reclaim = await post(`/internal/sessions/${sessionId}/turn/claim`, { userId: userIds[0] })
    expect(reclaim.status).toBe(204)
  })
})

describe('POST /internal/sessions/:id/turn/advance', () => {
  test('moves to the next member and mirrors it back to Postgres', async () => {
    const { sessionId, userIds } = await seedSession([{ turnOrder: 0 }, { turnOrder: 1 }])
    await get(`/internal/sessions/${sessionId}/turn`)

    const res = await post(`/internal/sessions/${sessionId}/turn/advance`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { currentTurnUserId: string }
    expect(body.currentTurnUserId).toBe(userIds[1])

    await new Promise((r) => setTimeout(r, 100)) // fire-and-forget write-back
    const row = await db.selectFrom('sessions').select('current_turn_user_id').where('id', '=', sessionId).executeTakeFirstOrThrow()
    expect(row.current_turn_user_id).toBe(userIds[1])
  })

  test('still 200s even when the fire-and-forget Postgres write-back fails', async () => {
    const { sessionId, userIds } = await seedSession([{ turnOrder: 0 }, { turnOrder: 1 }])
    await get(`/internal/sessions/${sessionId}/turn`)

    const res = await postWithBrokenDb(`/internal/sessions/${sessionId}/turn/advance`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { currentTurnUserId: string }
    expect(body.currentTurnUserId).toBe(userIds[1])
  })

  test('publishes a roster-update presence event reachable by a real subscriber', async () => {
    const { sessionId, userIds } = await seedSession([{ turnOrder: 0 }, { turnOrder: 1 }])
    await get(`/internal/sessions/${sessionId}/turn`)

    const events = collectPresenceEvents(sessionId, 1)
    await new Promise((r) => setTimeout(r, 100))
    await post(`/internal/sessions/${sessionId}/turn/advance`)

    const [rosterUpdate] = await events
    expect(rosterUpdate).toEqual({
      type: 'roster-update',
      sessionId,
      currentTurnUserId: userIds[1],
      roster: [
        { userId: userIds[0], turnOrder: 0 },
        { userId: userIds[1], turnOrder: 1 },
      ],
    })
  })
})
