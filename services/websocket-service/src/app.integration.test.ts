import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { DEFAULT_LOCAL_DATABASE_URL, createDb, createPgPool, createSessionToken, roomSubject, runMigrations } from '@mincirklen/shared'
import { connect, type NatsConnection } from 'nats'
import { createApp } from './app'

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222'
const AUTH_SECRET = 'fanout-integration-test-secret'

const pool = createPgPool(
  process.env.TEST_DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL,
  'test',
)
const db = createDb(pool)

// Two fully independent app instances, each with its own NATS connection —
// this is the point of the test: nothing is shared between them except the
// database and the NATS server, exactly like two real websocket-service
// pods. A third, separate connection stands in for trpc-api publishing an
// approved message.
let natsA: NatsConnection
let natsB: NatsConnection
let publisherNats: NatsConnection
let serverA: ReturnType<typeof Bun.serve>
let serverB: ReturnType<typeof Bun.serve>

beforeAll(async () => {
  await runMigrations(db, 'test')
  ;[natsA, natsB, publisherNats] = await Promise.all([
    connect({ servers: NATS_URL }),
    connect({ servers: NATS_URL }),
    connect({ servers: NATS_URL }),
  ])

  const appA = createApp({ db, nats: natsA, authSecret: AUTH_SECRET, allowedOrigins: [] })
  const appB = createApp({ db, nats: natsB, authSecret: AUTH_SECRET, allowedOrigins: [] })

  const { websocket } = await import('hono/bun')
  serverA = Bun.serve({ port: 0, fetch: appA.fetch, websocket })
  serverB = Bun.serve({ port: 0, fetch: appB.fetch, websocket })
})

afterAll(async () => {
  serverA.stop(true)
  serverB.stop(true)
  await Promise.all([natsA.close(), natsB.close(), publisherNats.close()])
  await db.destroy()
})

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true })
    ws.addEventListener('error', (event) => reject(event), { once: true })
  })
}

function waitForMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    ws.addEventListener('message', (event) => resolve(event.data as string), { once: true })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('cross-pod fanout', () => {
  test('a message published once reaches clients connected to two different pods', async () => {
    const userX = await db.insertInto('users').defaultValues().returningAll().executeTakeFirstOrThrow()
    const userY = await db.insertInto('users').defaultValues().returningAll().executeTakeFirstOrThrow()
    const session = await db.insertInto('sessions').defaultValues().returningAll().executeTakeFirstOrThrow()
    await db
      .insertInto('session_users')
      .values([
        { session_id: session.id, user_id: userX.id, turn_order: 0 },
        { session_id: session.id, user_id: userY.id, turn_order: 1 },
      ])
      .execute()

    const tokenX = createSessionToken(userX.id, AUTH_SECRET)
    const tokenY = createSessionToken(userY.id, AUTH_SECRET)

    // X connects to pod A, Y connects to pod B — two independent
    // Bun.serve instances, standing in for two independent websocket-service
    // replicas.
    const wsX = new WebSocket(`ws://localhost:${serverA.port}/ws?sessionId=${session.id}`, {
      headers: { Cookie: `mc_session=${tokenX}` },
    })
    const wsY = new WebSocket(`ws://localhost:${serverB.port}/ws?sessionId=${session.id}`, {
      headers: { Cookie: `mc_session=${tokenY}` },
    })

    try {
      await Promise.all([waitForOpen(wsX), waitForOpen(wsY)])

      const receivedX = waitForMessage(wsX)
      const receivedY = waitForMessage(wsY)

      // Give each pod's async onOpen handler time to complete its NATS
      // SUBSCRIBE round trip before publishing.
      await sleep(300)

      const payload = JSON.stringify({ body: 'hello from the pipeline' })
      publisherNats.publish(roomSubject(session.id), payload)

      const [messageX, messageY] = await Promise.all([receivedX, receivedY])

      // Both pods relayed the single publish to their own locally
      // connected client — this is the actual horizontal-scaling proof.
      expect(messageX).toBe(payload)
      expect(messageY).toBe(payload)
    } finally {
      wsX.close()
      wsY.close()
    }
  })

  test('rejects a connection for a user who is not a member of the session', async () => {
    const outsider = await db.insertInto('users').defaultValues().returningAll().executeTakeFirstOrThrow()
    const session = await db.insertInto('sessions').defaultValues().returningAll().executeTakeFirstOrThrow()
    const token = createSessionToken(outsider.id, AUTH_SECRET)

    const res = await fetch(`http://localhost:${serverA.port}/ws?sessionId=${session.id}`, {
      headers: { Cookie: `mc_session=${token}`, Upgrade: 'websocket', Connection: 'Upgrade' },
    })

    expect(res.status).toBe(403)
  })

  test('rejects a connection with no session cookie', async () => {
    const session = await db.insertInto('sessions').defaultValues().returningAll().executeTakeFirstOrThrow()

    const res = await fetch(`http://localhost:${serverA.port}/ws?sessionId=${session.id}`, {
      headers: { Upgrade: 'websocket', Connection: 'Upgrade' },
    })

    expect(res.status).toBe(401)
  })

  test('rejects a connection missing the sessionId query parameter', async () => {
    const res = await fetch(`http://localhost:${serverA.port}/ws`, {
      headers: { Upgrade: 'websocket', Connection: 'Upgrade' },
    })

    expect(res.status).toBe(400)
  })

  test('rejects a connection from a disallowed origin', async () => {
    const user = await db.insertInto('users').defaultValues().returningAll().executeTakeFirstOrThrow()
    const session = await db.insertInto('sessions').defaultValues().returningAll().executeTakeFirstOrThrow()
    const token = createSessionToken(user.id, AUTH_SECRET)

    const { websocket } = await import('hono/bun')
    const restrictedApp = createApp({
      db,
      nats: natsA,
      authSecret: AUTH_SECRET,
      allowedOrigins: ['https://mincirklen.dk'],
    })
    const restrictedServer = Bun.serve({ port: 0, fetch: restrictedApp.fetch, websocket })

    try {
      const res = await fetch(`http://localhost:${restrictedServer.port}/ws?sessionId=${session.id}`, {
        headers: {
          Cookie: `mc_session=${token}`,
          Upgrade: 'websocket',
          Connection: 'Upgrade',
          Origin: 'https://evil.example',
        },
      })
      expect(res.status).toBe(403)
    } finally {
      restrictedServer.stop(true)
    }
  })

  test('replies with an error frame to an inbound client message — delivery-only contract', async () => {
    const user = await db.insertInto('users').defaultValues().returningAll().executeTakeFirstOrThrow()
    const session = await db.insertInto('sessions').defaultValues().returningAll().executeTakeFirstOrThrow()
    await db
      .insertInto('session_users')
      .values({ session_id: session.id, user_id: user.id, turn_order: 0 })
      .execute()
    const token = createSessionToken(user.id, AUTH_SECRET)

    const ws = new WebSocket(`ws://localhost:${serverA.port}/ws?sessionId=${session.id}`, {
      headers: { Cookie: `mc_session=${token}` },
    })

    try {
      await waitForOpen(ws)
      const reply = waitForMessage(ws)
      ws.send('hello from the client')

      const message = JSON.parse(await reply) as { type: string }
      expect(message.type).toBe('error')
    } finally {
      ws.close()
    }
  })
})

describe('/healthz', () => {
  test('reports ok', async () => {
    const res = await fetch(`http://localhost:${serverA.port}/healthz`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })
})
