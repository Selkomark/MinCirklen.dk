import { afterAll, describe, expect, test } from 'bun:test'
import { DEFAULT_LOCAL_DATABASE_URL, createDb, createPgPool, runMigrations } from '@mincirklen/shared'
import type { Redis } from 'ioredis'
import type { NatsConnection } from 'nats'
import { createApp } from './app'
import { linkIdentity } from './repositories/userIdentityRepository'

const pool = createPgPool(
  process.env.TEST_DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL,
  'test',
)
const db = createDb(pool)

await runMigrations(db, 'test')

const app = createApp({
  db,
  redis: {} as Redis, // not exercised by the auth flow under test
  nats: {} as NatsConnection, // not exercised by the auth flow under test
  authSecret: 'integration-test-secret',
  moderationServiceUrl: 'http://unused.invalid',
  publicBaseUrl: 'https://dev-mincirklen.dk',
  vault: {
    provider: 'vault',
    vaultAddr: process.env.TEST_VAULT_ADDR ?? 'http://localhost:8200',
    vaultToken: process.env.TEST_VAULT_TOKEN ?? 'dev-only-not-for-production',
  },
  identityHashKey: 'app-integration-test-identity-hash-key',
})

afterAll(async () => {
  await db.destroy()
})

function extractCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) throw new Error('expected a set-cookie header')
  return setCookie.split(';')[0] as string
}

describe('auth flow through the Hono app', () => {
  test('createAnonymousSession issues a cookie and a matching token', async () => {
    const res = await app.request('/trpc/auth.createAnonymousSession', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { result: { data: { userId: string; token: string } } }
    expect(body.result.data.userId).toMatch(/^[0-9a-f-]{36}$/)

    const cookie = extractCookie(res)
    expect(cookie.startsWith('mc_session=')).toBe(true)
  })

  test('whoAmI succeeds with the issued cookie and fails without it', async () => {
    const created = await app.request('/trpc/auth.createAnonymousSession', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const cookie = extractCookie(created)
    const { result } = (await created.json()) as { result: { data: { userId: string } } }

    const authed = await app.request('/trpc/auth.whoAmI', {
      headers: { cookie },
    })
    expect(authed.status).toBe(200)
    const authedBody = (await authed.json()) as { result: { data: { userId: string } } }
    expect(authedBody.result.data.userId).toBe(result.data.userId)

    const unauthed = await app.request('/trpc/auth.whoAmI')
    expect(unauthed.status).toBe(401)
  })

  test('logout clears the session cookie and works even with no session at all', async () => {
    const created = await app.request('/trpc/auth.createAnonymousSession', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const cookie = extractCookie(created)

    const res = await app.request('/trpc/auth.logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
    const sessionCookieHeader = res.headers.getSetCookie().find((c) => c.startsWith('mc_session='))
    expect(sessionCookieHeader).toBeDefined()
    expect(sessionCookieHeader).toContain('Max-Age=0')

    const withoutSession = await app.request('/trpc/auth.logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(withoutSession.status).toBe(200)
  })

  test('completeProfile rejects a session that has no linked Google identity', async () => {
    const created = await app.request('/trpc/auth.createAnonymousSession', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const cookie = extractCookie(created)

    const input = {
      firstName: 'Ada',
      lastName: 'Lovelace',
      country: 'GB',
      mobileNumber: '+44 20 7946 0958',
      stayAnonymous: true,
    }

    // A bare anonymous session — no Google link yet — must never be able to
    // "complete" a profile. Filling in name/mobile only counts once it's
    // tied to a real, traceable Google identity.
    const res = await app.request('/trpc/auth.completeProfile', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(input),
    })
    expect(res.status).toBe(403)

    const unauthed = await app.request('/trpc/auth.completeProfile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    expect(unauthed.status).toBe(401)
  })

  test('completeProfile persists the submitted profile once Google-linked', async () => {
    const created = await app.request('/trpc/auth.createAnonymousSession', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const cookie = extractCookie(created)
    const { result } = (await created.json()) as { result: { data: { userId: string } } }
    await linkIdentity(db, result.data.userId, 'google', `test-subject-${result.data.userId}`)

    const res = await app.request('/trpc/auth.completeProfile', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        firstName: 'Ada',
        lastName: 'Lovelace',
        country: 'GB',
        mobileNumber: '+44 20 7946 0958',
        stayAnonymous: true,
      }),
    })
    expect(res.status).toBe(200)
  })

  test('myProfile reports hasLinkedIdentity/hasProfile/profile through the full verification lifecycle, and requires auth', async () => {
    const created = await app.request('/trpc/auth.createAnonymousSession', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const cookie = extractCookie(created)
    const { result: session } = (await created.json()) as { result: { data: { userId: string } } }

    const bare = await app.request('/trpc/auth.myProfile', { headers: { cookie } })
    expect(bare.status).toBe(200)
    const bareBody = (await bare.json()) as {
      result: { data: { hasLinkedIdentity: boolean; hasProfile: boolean; profile: unknown } }
    }
    expect(bareBody.result.data).toEqual({ hasLinkedIdentity: false, hasProfile: false, profile: null })

    await linkIdentity(db, session.data.userId, 'google', `test-subject-${session.data.userId}`)

    const linked = await app.request('/trpc/auth.myProfile', { headers: { cookie } })
    const linkedBody = (await linked.json()) as {
      result: { data: { hasLinkedIdentity: boolean; hasProfile: boolean; profile: unknown } }
    }
    expect(linkedBody.result.data).toEqual({ hasLinkedIdentity: true, hasProfile: false, profile: null })

    await app.request('/trpc/auth.completeProfile', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        firstName: 'Grace',
        lastName: 'Hopper',
        country: 'US',
        mobileNumber: '+1 202 555 0119',
        stayAnonymous: false,
      }),
    })

    const after = await app.request('/trpc/auth.myProfile', { headers: { cookie } })
    const afterBody = (await after.json()) as {
      result: { data: { hasLinkedIdentity: boolean; hasProfile: boolean; profile: { firstName: string } | null } }
    }
    expect(afterBody.result.data.hasLinkedIdentity).toBe(true)
    expect(afterBody.result.data.hasProfile).toBe(true)
    expect(afterBody.result.data.profile?.firstName).toBe('Grace')

    const unauthed = await app.request('/trpc/auth.myProfile')
    expect(unauthed.status).toBe(401)
  })

  test('myProfile reports hasProfile:true (and keeps the app usable) even when the profile ciphertext cannot be decrypted', async () => {
    // Reproduces the real incident: Vault's transit key rotated/reset out
    // from under existing ciphertext. Before this fix, myProfile's
    // hasProfile signal was derived from decrypt success — a KMS/Vault
    // outage silently reported a fully-registered user as "needs
    // profile," bouncing them back into the registration flow forever
    // instead of just degrading PII display.
    const created = await app.request('/trpc/auth.createAnonymousSession', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const cookie = extractCookie(created)
    const { result: session } = (await created.json()) as { result: { data: { userId: string } } }
    await linkIdentity(db, session.data.userId, 'google', `test-subject-${session.data.userId}`)

    await app.request('/trpc/auth.completeProfile', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        firstName: 'Ada',
        lastName: 'Lovelace',
        country: 'GB',
        mobileNumber: '+44 20 7946 0958',
        stayAnonymous: true,
      }),
    })

    await db
      .updateTable('user_profiles')
      .set({ pii_ciphertext: 'not-a-real-vault-ciphertext' })
      .where('user_id', '=', session.data.userId)
      .execute()

    const res = await app.request('/trpc/auth.myProfile', { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      result: { data: { hasLinkedIdentity: boolean; hasProfile: boolean; profile: unknown } }
    }
    expect(body.result.data).toEqual({ hasLinkedIdentity: true, hasProfile: true, profile: null })
  })
})

describe('/health', () => {
  test('reports each dependency check', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)

    const body = (await res.json()) as { service: string; postgres: string }
    expect(body.service).toBe('trpc-api')
    expect(body.postgres).toBe('ok')
  })
})
