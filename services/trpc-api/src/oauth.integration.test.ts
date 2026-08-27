import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { DEFAULT_LOCAL_DATABASE_URL, createDb, createPgPool, createSessionToken, runMigrations } from '@mincirklen/shared'
import type { Redis } from 'ioredis'
import type { NatsConnection } from 'nats'
import { generateKeyPairSync, sign as signData } from 'node:crypto'
import { createApp } from './app'
import { hashIdentitySubject } from './auth/identityHash'
import { upsertUserProfile } from './repositories/userProfileRepository'

const IDENTITY_HASH_KEY = 'oauth-integration-test-identity-hash-key'

// Asserts against the real DB rows using the exact function under test —
// not an independent reimplementation — so this can't silently drift from
// oauthController.ts's actual hashing behavior.
function hashSubject(subject: string): string {
  return hashIdentitySubject(subject, IDENTITY_HASH_KEY)
}

const pool = createPgPool(
  process.env.TEST_DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL,
  'test',
)
const db = createDb(pool)

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const KID = 'fake-google-key-1'
const JWKS = { keys: [{ ...(publicKey.export({ format: 'jwk' }) as object), kid: KID }] }

const CLIENT_ID = 'fake-client-id'
const CLIENT_SECRET = 'fake-client-secret'
const AUTH_SECRET = 'oauth-integration-test-secret'
const PUBLIC_BASE_URL = 'https://dev-mincirklen.dk'
const TEST_VAULT = {
  vaultAddr: process.env.TEST_VAULT_ADDR ?? 'http://localhost:8200',
  vaultToken: process.env.TEST_VAULT_TOKEN ?? 'dev-only-not-for-production',
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url')
}

function signIdToken(payload: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', kid: KID, typ: 'JWT' }))
  const body = base64url(JSON.stringify(payload))
  const signature = signData('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey)
  return `${header}.${body}.${signature.toString('base64url')}`
}

// The fake Google server's /token response is driven by this — each test
// sets it to the subject it wants to log in as.
let nextSubject = 'google-subject-default'

let fakeGoogle: ReturnType<typeof Bun.serve>
let app: ReturnType<typeof createApp>

beforeAll(async () => {
  await runMigrations(db, 'test')

  fakeGoogle = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === '/token') {
        const body = await req.formData()
        if (body.get('code') === 'fail-me') {
          return new Response(null, { status: 400 })
        }
        const idToken = signIdToken({
          sub: nextSubject,
          aud: CLIENT_ID,
          iss: 'https://accounts.google.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
        return Response.json({ id_token: idToken })
      }
      if (url.pathname === '/jwks') {
        return Response.json(JWKS)
      }
      return new Response('not found', { status: 404 })
    },
  })

  app = createApp({
    db,
    redis: {} as Redis, // not exercised by the OAuth flow under test
    nats: {} as NatsConnection, // not exercised by the OAuth flow under test
    authSecret: AUTH_SECRET,
    moderationServiceUrl: 'http://unused.invalid',
    publicBaseUrl: PUBLIC_BASE_URL,
    vault: TEST_VAULT,
    identityHashKey: IDENTITY_HASH_KEY,
    googleClientId: CLIENT_ID,
    googleClientSecret: CLIENT_SECRET,
    googleOAuthEndpoints: {
      authUri: `http://localhost:${fakeGoogle.port}/auth`,
      tokenUri: `http://localhost:${fakeGoogle.port}/token`,
      jwksUri: `http://localhost:${fakeGoogle.port}/jwks`,
    },
  })
})

afterAll(async () => {
  fakeGoogle.stop(true)
  await db.destroy()
})

function findCookie(res: Response, name: string): string | null {
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))
  return cookie ? (cookie.split(';')[0] as string) : null
}

async function startLogin(): Promise<{ stateCookie: string; state: string }> {
  const res = await app.request('/auth/google/start')
  expect(res.status).toBe(302)

  const stateCookie = findCookie(res, 'mc_oauth_state')
  if (!stateCookie) throw new Error('expected an mc_oauth_state cookie')

  const location = new URL(res.headers.get('location') ?? '')
  const state = location.searchParams.get('state')
  if (!state) throw new Error('expected a state query param on the redirect')

  return { stateCookie, state }
}

describe('GET /auth/google/start', () => {
  test('redirects to the configured authorization endpoint with a state param', async () => {
    const { state } = await startLogin()
    expect(state.length).toBeGreaterThan(0)
  })
})

describe('GET /auth/callback/google', () => {
  test('first login creates a user, links the identity, and redirects to /register', async () => {
    nextSubject = `subject-${crypto.randomUUID()}`
    const subjectHash = hashSubject(nextSubject)
    const { stateCookie, state } = await startLogin()

    const res = await app.request(`/auth/callback/google?code=fake-code&state=${state}`, {
      headers: { cookie: stateCookie },
    })

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`${PUBLIC_BASE_URL}/register?welcome=1`)

    const sessionCookie = findCookie(res, 'mc_session')
    expect(sessionCookie).not.toBeNull()

    const linked = await db
      .selectFrom('user_identities')
      .selectAll()
      .where('provider', '=', 'google')
      .where('provider_subject_hash', '=', subjectHash)
      .executeTakeFirstOrThrow()
    expect(linked.user_id).not.toBeNull()
  })

  test('a repeat login for the same subject reuses the user and redirects to /new once a profile exists', async () => {
    nextSubject = `subject-${crypto.randomUUID()}`

    const subjectHash = hashSubject(nextSubject)

    const first = await startLogin()
    const firstRes = await app.request(`/auth/callback/google?code=fake-code&state=${first.state}`, {
      headers: { cookie: first.stateCookie },
    })
    expect(firstRes.status).toBe(302)
    expect(firstRes.headers.get('location')).toBe(`${PUBLIC_BASE_URL}/register?welcome=1`)

    const linked = await db
      .selectFrom('user_identities')
      .select('user_id')
      .where('provider_subject_hash', '=', subjectHash)
      .executeTakeFirstOrThrow()
    await upsertUserProfile(db, TEST_VAULT, {
      userId: linked.user_id,
      firstName: 'Ada',
      lastName: 'Lovelace',
      country: 'GB',
      mobileNumber: '+44 20 7946 0958',
      stayAnonymous: true,
      termsAcceptedAt: new Date(),
    })

    const second = await startLogin()
    const secondRes = await app.request(`/auth/callback/google?code=fake-code&state=${second.state}`, {
      headers: { cookie: second.stateCookie },
    })

    expect(secondRes.status).toBe(302)
    expect(secondRes.headers.get('location')).toBe(`${PUBLIC_BASE_URL}/new`)

    const rows = await db
      .selectFrom('user_identities')
      .selectAll()
      .where('provider_subject_hash', '=', subjectHash)
      .execute()
    expect(rows).toHaveLength(1)
  })

  test('a repeat login for a subject that never completed registration redirects to /register again', async () => {
    nextSubject = `subject-${crypto.randomUUID()}`

    const first = await startLogin()
    const firstRes = await app.request(`/auth/callback/google?code=fake-code&state=${first.state}`, {
      headers: { cookie: first.stateCookie },
    })
    expect(firstRes.headers.get('location')).toBe(`${PUBLIC_BASE_URL}/register?welcome=1`)

    // Simulates abandoning the registration form: the identity is linked
    // but no user_profiles row was ever created.
    const second = await startLogin()
    const secondRes = await app.request(`/auth/callback/google?code=fake-code&state=${second.state}`, {
      headers: { cookie: second.stateCookie },
    })

    expect(secondRes.status).toBe(302)
    expect(secondRes.headers.get('location')).toBe(`${PUBLIC_BASE_URL}/register?welcome=1`)
  })

  test('an existing anonymous session gets upgraded on first Google login', async () => {
    nextSubject = `subject-${crypto.randomUUID()}`
    const anonymousUser = await db
      .insertInto('users')
      .defaultValues()
      .returningAll()
      .executeTakeFirstOrThrow()
    const anonymousToken = createSessionToken(anonymousUser.id, AUTH_SECRET)
    const subjectHash = hashSubject(nextSubject)

    const { stateCookie, state } = await startLogin()
    const res = await app.request(`/auth/callback/google?code=fake-code&state=${state}`, {
      headers: { cookie: `${stateCookie}; mc_session=${anonymousToken}` },
    })

    expect(res.status).toBe(302)

    const linked = await db
      .selectFrom('user_identities')
      .select('user_id')
      .where('provider_subject_hash', '=', subjectHash)
      .executeTakeFirstOrThrow()
    expect(linked.user_id).toBe(anonymousUser.id)
  })

  test('a session cookie signed for a user that no longer exists falls back to creating a fresh user instead of 500ing', async () => {
    nextSubject = `subject-${crypto.randomUUID()}`
    // Signed as if a real user row existed, but none does — reproduces a
    // real incident: an mc_session cookie left over in a browser from a
    // deleted/reset account hit user_identities' foreign key constraint
    // and crashed this callback with an unhandled 500.
    const staleToken = createSessionToken(crypto.randomUUID(), AUTH_SECRET)
    const subjectHash = hashSubject(nextSubject)

    const { stateCookie, state } = await startLogin()
    const res = await app.request(`/auth/callback/google?code=fake-code&state=${state}`, {
      headers: { cookie: `${stateCookie}; mc_session=${staleToken}` },
    })

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`${PUBLIC_BASE_URL}/register?welcome=1`)

    const linked = await db
      .selectFrom('user_identities')
      .select('user_id')
      .where('provider_subject_hash', '=', subjectHash)
      .executeTakeFirstOrThrow()

    const linkedUser = await db.selectFrom('users').select('id').where('id', '=', linked.user_id).executeTakeFirst()
    expect(linkedUser).toBeDefined()
  })

  test('rejects a missing state', async () => {
    const res = await app.request('/auth/callback/google?code=fake-code')
    expect(res.status).toBe(400)
  })

  test('rejects a mismatched state', async () => {
    const { stateCookie } = await startLogin()
    const res = await app.request('/auth/callback/google?code=fake-code&state=not-the-right-state', {
      headers: { cookie: stateCookie },
    })
    expect(res.status).toBe(400)
  })

  test('rejects a missing authorization code', async () => {
    const { stateCookie, state } = await startLogin()
    const res = await app.request(`/auth/callback/google?state=${state}`, { headers: { cookie: stateCookie } })
    expect(res.status).toBe(400)
  })

  test('returns 400 when Google token exchange fails', async () => {
    const { stateCookie, state } = await startLogin()
    const res = await app.request(`/auth/callback/google?code=fail-me&state=${state}`, {
      headers: { cookie: stateCookie },
    })
    expect(res.status).toBe(400)
  })
})

describe('when Google login is not configured', () => {
  test('both routes return 503', async () => {
    const unconfiguredApp = createApp({
      db,
      redis: {} as Redis,
      nats: {} as NatsConnection,
      authSecret: AUTH_SECRET,
      moderationServiceUrl: 'http://unused.invalid',
      publicBaseUrl: PUBLIC_BASE_URL,
      vault: TEST_VAULT,
      identityHashKey: IDENTITY_HASH_KEY,
    })

    expect((await unconfiguredApp.request('/auth/google/start')).status).toBe(503)
    expect((await unconfiguredApp.request('/auth/callback/google?code=x&state=y')).status).toBe(503)
  })
})
