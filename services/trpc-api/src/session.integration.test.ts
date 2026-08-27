import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { DEFAULT_LOCAL_DATABASE_URL, createDb, createPgPool, runMigrations } from '@mincirklen/shared'
import type { Redis } from 'ioredis'
import { connect, type NatsConnection } from 'nats'
import { createApp } from './app'
import { linkIdentity } from './repositories/userIdentityRepository'
import { upsertUserProfile } from './repositories/userProfileRepository'

const pool = createPgPool(
  process.env.TEST_DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL,
  'test',
)
const db = createDb(pool)
const VAULT = {
  vaultAddr: process.env.TEST_VAULT_ADDR ?? 'http://localhost:8200',
  vaultToken: process.env.TEST_VAULT_TOKEN ?? 'dev-only-not-for-production',
}

let nats: NatsConnection
let fakeModerationService: ReturnType<typeof Bun.serve>
let app: ReturnType<typeof createApp>

beforeAll(async () => {
  await runMigrations(db, 'test')

  nats = await connect({ servers: process.env.NATS_URL ?? 'nats://localhost:4222' })

  // The real moderation-service is intentionally not published to the host
  // (see docs/local_dev.md), and it only ever returns 'pass' anyway — this
  // in-process fake stands in for it so classifyMessage's real HTTP round
  // trip is still exercised, without touching docker-compose port publishing.
  // Body-triggered classification, mirroring the real moderation-service's
  // request/response contract exactly (unlike the real stub, this fake
  // can return flag/crisis too — real moderation logic is proprietary and
  // permanently a "pass"-only stub, so this is the only way to exercise
  // sessionRouter's flag/crisis wiring against a real HTTP round trip
  // rather than only via messageService's mocked unit tests).
  fakeModerationService = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === '/classify') {
        const { message } = (await req.json()) as { message: string }
        const result = message === 'FLAG_ME' ? 'flag' : message === 'CRISIS_ME' ? 'crisis' : 'pass'
        return Response.json({ result })
      }
      return new Response('not found', { status: 404 })
    },
  })

  app = createApp({
    db,
    redis: {} as Redis, // not exercised by the session/message flow under test
    nats,
    authSecret: 'session-integration-test-secret',
    moderationServiceUrl: `http://localhost:${fakeModerationService.port}`,
    publicBaseUrl: 'https://dev-mincirklen.dk',
    vault: VAULT,
    identityHashKey: 'session-integration-test-identity-hash-key',
  })
})

afterAll(async () => {
  fakeModerationService.stop()
  await nats.close()
  await db.destroy()
})

interface Actor {
  cookie: string
  userId: string
}

// sessionRouter's procedures are verifiedProcedure-gated (Google-linked +
// completed profile — see controllers/trpc.ts), so every actor used
// against session.* has to actually clear that bar, not just hold a
// session cookie. There's no fake-Google harness in this file (that's
// oauth.integration.test.ts's job) — linking the identity and completing
// the profile directly via the repositories is the same setup shortcut
// oauth.integration.test.ts already uses for the profile half.
async function createActor(): Promise<Actor> {
  const res = await app.request('/trpc/auth.createAnonymousSession', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })
  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) throw new Error('expected a set-cookie header')

  const body = (await res.json()) as { result: { data: { userId: string } } }
  const userId = body.result.data.userId

  await linkIdentity(db, userId, 'google', `test-subject-${userId}`)
  await upsertUserProfile(db, VAULT, {
    userId,
    firstName: 'Test',
    lastName: 'Actor',
    country: 'US',
    mobileNumber: '+1 555 0100',
    stayAnonymous: true,
    termsAcceptedAt: new Date(),
  })

  return { cookie: setCookie.split(';')[0] as string, userId }
}

async function call(actor: Actor, path: string, input: unknown) {
  return app.request(`/trpc/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: actor.cookie },
    body: JSON.stringify(input),
  })
}

async function query(actor: Actor, path: string, input: Record<string, unknown>) {
  const search = new URLSearchParams({ input: JSON.stringify(input) })
  return app.request(`/trpc/${path}?${search.toString()}`, {
    headers: { cookie: actor.cookie },
  })
}

describe('verifiedProcedure gate on session.*', () => {
  test('a bare anonymous session (no Google link, no profile) is rejected', async () => {
    const res = await app.request('/trpc/auth.createAnonymousSession', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] as string

    const createRes = await call({ cookie, userId: '' }, 'session.create', {})
    expect(createRes.status).toBe(403)
  })

  test('a Google-linked session with no completed profile is rejected', async () => {
    const res = await app.request('/trpc/auth.createAnonymousSession', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] as string
    const { result } = (await res.json()) as { result: { data: { userId: string } } }

    await linkIdentity(db, result.data.userId, 'google', `test-subject-${result.data.userId}`)

    const createRes = await call({ cookie, userId: result.data.userId }, 'session.create', {})
    expect(createRes.status).toBe(403)
  })

  test('a fully verified actor (Google-linked + profiled) is allowed through', async () => {
    const actor = await createActor()
    const createRes = await call(actor, 'session.create', {})
    expect(createRes.status).toBe(200)
  })
})

describe('session + message pipeline', () => {
  test('create, join, send in turn order, and fan out to NATS', async () => {
    const alice = await createActor()
    const bob = await createActor()

    const createRes = await call(alice, 'session.create', {})
    expect(createRes.status).toBe(200)
    const { result: created } = (await createRes.json()) as { result: { data: { id: string } } }
    const sessionId = created.data.id

    const aliceJoin = await call(alice, 'session.join', { sessionId })
    expect(aliceJoin.status).toBe(200)
    const bobJoin = await call(bob, 'session.join', { sessionId })
    expect(bobJoin.status).toBe(200)

    const stateRes = await query(alice, 'session.getState', { sessionId })
    const { result: state } = (await stateRes.json()) as {
      result: { data: { currentTurnUserId: string; roster: { userId: string; turnOrder: number }[] } }
    }
    expect(state.data.currentTurnUserId).toBe(alice.userId)
    expect(state.data.roster).toEqual([
      { userId: alice.userId, turnOrder: 0 },
      { userId: bob.userId, turnOrder: 1 },
    ])

    // Bob is not the current-turn holder — rejected.
    const bobTriesEarly = await call(bob, 'session.sendMessage', { sessionId, body: 'not my turn' })
    expect(bobTriesEarly.status).toBe(403)

    const aliceSends = await call(alice, 'session.sendMessage', { sessionId, body: 'hello room' })
    expect(aliceSends.status).toBe(200)
    const { result: sent } = (await aliceSends.json()) as { result: { data: { status: string } } }
    expect(sent.data.status).toBe('sent')

    const afterState = await query(alice, 'session.getState', { sessionId })
    const { result: afterData } = (await afterState.json()) as {
      result: { data: { currentTurnUserId: string } }
    }
    expect(afterData.data.currentTurnUserId).toBe(bob.userId)

    const messagesRes = await query(alice, 'session.listMessages', { sessionId })
    const { result: messages } = (await messagesRes.json()) as { result: { data: { body: string }[] } }
    expect(messages.data.map((m) => m.body)).toEqual(['hello room'])

    // Alice's turn has passed — sending again is rejected.
    const aliceSendsAgain = await call(alice, 'session.sendMessage', { sessionId, body: 'again' })
    expect(aliceSendsAgain.status).toBe(403)
  })

  test('rejects a non-member trying to send', async () => {
    const alice = await createActor()
    const outsider = await createActor()

    const createRes = await call(alice, 'session.create', {})
    const { result: created } = (await createRes.json()) as { result: { data: { id: string } } }

    const res = await call(outsider, 'session.sendMessage', { sessionId: created.data.id, body: 'hi' })
    expect(res.status).toBe(403)
  })

  test('rejects a non-member reading session state or message history — no cross-session visibility', async () => {
    const alice = await createActor()
    const bob = await createActor()
    const outsider = await createActor()

    const createRes = await call(alice, 'session.create', {})
    const { result: created } = (await createRes.json()) as { result: { data: { id: string } } }
    const sessionId = created.data.id
    await call(alice, 'session.join', { sessionId })
    await call(bob, 'session.join', { sessionId })
    await call(alice, 'session.sendMessage', { sessionId, body: 'private to this circle' })

    const outsiderState = await query(outsider, 'session.getState', { sessionId })
    expect(outsiderState.status).toBe(403)

    const outsiderMessages = await query(outsider, 'session.listMessages', { sessionId })
    expect(outsiderMessages.status).toBe(403)

    // A member can still read both — confirms this isn't just blocking everyone.
    const memberState = await query(bob, 'session.getState', { sessionId })
    expect(memberState.status).toBe(200)
    const memberMessages = await query(bob, 'session.listMessages', { sessionId })
    expect(memberMessages.status).toBe(200)
  })

  test('"flag": holds the message back but still advances the turn', async () => {
    const alice = await createActor()
    const bob = await createActor()

    const createRes = await call(alice, 'session.create', {})
    const { result: created } = (await createRes.json()) as { result: { data: { id: string } } }
    const sessionId = created.data.id
    await call(alice, 'session.join', { sessionId })
    await call(bob, 'session.join', { sessionId })

    const res = await call(alice, 'session.sendMessage', { sessionId, body: 'FLAG_ME' })
    expect(res.status).toBe(200)
    const { result } = (await res.json()) as { result: { data: { status: string } } }
    expect(result.data.status).toBe('held')

    const messagesRes = await query(alice, 'session.listMessages', { sessionId })
    const { result: messages } = (await messagesRes.json()) as { result: { data: unknown[] } }
    expect(messages.data).toHaveLength(0)

    const stateRes = await query(alice, 'session.getState', { sessionId })
    const { result: state } = (await stateRes.json()) as { result: { data: { currentTurnUserId: string } } }
    expect(state.data.currentTurnUserId).toBe(bob.userId)
  })

  test('"crisis": returns the resource card and does not advance the turn', async () => {
    const alice = await createActor()
    const bob = await createActor()

    const createRes = await call(alice, 'session.create', {})
    const { result: created } = (await createRes.json()) as { result: { data: { id: string } } }
    const sessionId = created.data.id
    await call(alice, 'session.join', { sessionId })
    await call(bob, 'session.join', { sessionId })

    const res = await call(alice, 'session.sendMessage', { sessionId, body: 'CRISIS_ME' })
    expect(res.status).toBe(200)
    const { result } = (await res.json()) as {
      result: { data: { status: string; resource: { resources: unknown[] } } }
    }
    expect(result.data.status).toBe('crisis')
    expect(result.data.resource.resources.length).toBeGreaterThan(0)

    const stateRes = await query(alice, 'session.getState', { sessionId })
    const { result: state } = (await stateRes.json()) as { result: { data: { currentTurnUserId: string } } }
    // Turn intentionally unchanged — still Alice's.
    expect(state.data.currentTurnUserId).toBe(alice.userId)
  })

  test('join surfaces "session full" and "session not found" through the router', async () => {
    const host = await createActor()
    const createRes = await call(host, 'session.create', {})
    const { result: created } = (await createRes.json()) as { result: { data: { id: string } } }
    const sessionId = created.data.id

    for (let i = 0; i < 8; i++) {
      const actor = await createActor()
      const joinRes = await call(actor, 'session.join', { sessionId })
      expect(joinRes.status).toBe(200)
    }

    const oneTooMany = await createActor()
    const fullRes = await call(oneTooMany, 'session.join', { sessionId })
    expect(fullRes.status).toBe(409)

    const notFoundRes = await call(oneTooMany, 'session.join', {
      sessionId: '00000000-0000-0000-0000-000000000000',
    })
    expect(notFoundRes.status).toBe(404)
  })
})

describe('topics.list', () => {
  test('returns the seeded topics to a verified actor', async () => {
    const actor = await createActor()
    const res = await query(actor, 'topics.list', {})
    expect(res.status).toBe(200)

    const { result } = (await res.json()) as { result: { data: { slug: string; label: string }[] } }
    expect(result.data.some((t) => t.slug === 'grief' && t.label === 'Grief')).toBe(true)
  })
})

describe('scheduled circles (/start/new, /start/join)', () => {
  async function griefTopicId(actor: Actor): Promise<string> {
    const res = await query(actor, 'topics.list', {})
    const { result } = (await res.json()) as { result: { data: { id: string; slug: string }[] } }
    return result.data.find((t) => t.slug === 'grief')!.id
  }

  test('create persists topic/schedule/duration/capacity, and the circle appears in listOpen', async () => {
    const alice = await createActor()
    const topicId = await griefTopicId(alice)

    const createRes = await call(alice, 'session.create', {
      topicId,
      name: 'Weekly grief circle',
      scheduledAt: '2026-09-01T18:00:00.000Z',
      durationMinutes: 45,
      capacity: 6,
    })
    expect(createRes.status).toBe(200)
    const { result: created } = (await createRes.json()) as { result: { data: { id: string } } }

    const openRes = await query(alice, 'session.listOpen', { topicId, limit: 50 })
    expect(openRes.status).toBe(200)
    const { result: open } = (await openRes.json()) as {
      result: {
        data: {
          sessions: {
            id: string
            name: string
            durationMinutes: number | null
            capacity: number
            joinedCount: number
            topic: { id: string; slug: string; label: string }
          }[]
          nextCursor: string | null
        }
      }
    }
    const listed = open.data.sessions.find((s) => s.id === created.data.id)
    expect(listed).toMatchObject({
      name: 'Weekly grief circle',
      durationMinutes: 45,
      capacity: 6,
      joinedCount: 0,
      topic: { id: topicId, slug: 'grief', label: 'Grief' },
    })
  })

  test('listOpen supports filtering by search term and paging via nextCursor', async () => {
    const alice = await createActor()
    const topicId = await griefTopicId(alice)
    const marker = crypto.randomUUID().slice(0, 8)

    for (let i = 0; i < 3; i++) {
      await call(alice, 'session.create', {
        topicId,
        name: `Search filter circle ${marker} ${i}`,
        scheduledAt: '2026-09-01T18:00:00.000Z',
        durationMinutes: 30,
        capacity: 8,
      })
    }

    const firstPageRes = await query(alice, 'session.listOpen', { search: marker, limit: 2 })
    expect(firstPageRes.status).toBe(200)
    const { result: firstPage } = (await firstPageRes.json()) as {
      result: { data: { sessions: { id: string }[]; nextCursor: string | null; prevCursor: string | null } }
    }
    expect(firstPage.data.sessions).toHaveLength(2)
    expect(firstPage.data.nextCursor).not.toBeNull()
    expect(firstPage.data.prevCursor).toBeNull()

    const secondPageRes = await query(alice, 'session.listOpen', {
      search: marker,
      limit: 2,
      cursor: firstPage.data.nextCursor as string,
    })
    const { result: secondPage } = (await secondPageRes.json()) as {
      result: { data: { sessions: { id: string }[]; nextCursor: string | null; prevCursor: string | null } }
    }
    expect(secondPage.data.sessions).toHaveLength(1)
    expect(secondPage.data.nextCursor).toBeNull()
    expect(secondPage.data.prevCursor).not.toBeNull()

    const allIds = new Set([...firstPage.data.sessions, ...secondPage.data.sessions].map((s) => s.id))
    expect(allIds.size).toBe(3)

    // Windowed browsing (StartJoinPage.tsx) relies on this: paging
    // backward from the second page's own prevCursor must reproduce the
    // first page exactly.
    const backRes = await query(alice, 'session.listOpen', {
      search: marker,
      limit: 2,
      cursor: secondPage.data.prevCursor as string,
      direction: 'before',
    })
    const { result: back } = (await backRes.json()) as { result: { data: { sessions: { id: string }[] } } }
    expect(back.data.sessions.map((s) => s.id)).toEqual(firstPage.data.sessions.map((s) => s.id))
  })

  test('enforces the circle\'s own capacity rather than the ad-hoc default of 8', async () => {
    const alice = await createActor()
    const topicId = await griefTopicId(alice)

    const createRes = await call(alice, 'session.create', {
      topicId,
      name: 'Small grief circle',
      scheduledAt: '2026-09-01T18:00:00.000Z',
      durationMinutes: null,
      capacity: 1,
    })
    const { result: created } = (await createRes.json()) as { result: { data: { id: string } } }
    const sessionId = created.data.id

    await call(alice, 'session.join', { sessionId })

    const bob = await createActor()
    const fullRes = await call(bob, 'session.join', { sessionId })
    expect(fullRes.status).toBe(409)
  })

  test('rejects a partially-filled scheduling input', async () => {
    const alice = await createActor()
    const res = await call(alice, 'session.create', { topicId: await griefTopicId(alice) })
    expect(res.status).toBe(400)
  })

  test('rejects scheduling a circle more than a week out', async () => {
    const alice = await createActor()
    const eightDaysOut = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString()

    const res = await call(alice, 'session.create', {
      topicId: await griefTopicId(alice),
      name: 'Too far out',
      scheduledAt: eightDaysOut,
      durationMinutes: 60,
      capacity: 6,
    })
    expect(res.status).toBe(400)
  })
})
