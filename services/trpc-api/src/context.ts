import type { Database } from '@mincirklen/shared'
import { verifySessionToken } from '@mincirklen/shared'
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch'
import { getCookie } from 'hono/cookie'
import type { Context as HonoContext } from 'hono'
import type { Kysely } from 'kysely'
import type { Redis } from 'ioredis'
import type { NatsConnection } from 'nats'
import type { GoogleOAuthEndpoints } from './adapters/googleOAuthAdapter'
import type { KmsConfig } from './adapters/kmsAdapter'
import { touchUser } from './repositories/userRepository'
import { resolveSession } from './services/authService'

export const SESSION_COOKIE_NAME = 'mc_session'
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180 // 180 days

// Shared by authRouter.ts (anonymous login) and oauthController.ts (Google
// login) — both issue the same token format for the same cookie, so the
// attributes must never drift between the two call sites.
export function buildSessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`
}

export interface AppEnv {
  db: Kysely<Database>
  redis: Redis
  nats: NatsConnection
  authSecret: string
  moderationServiceUrl: string
  publicBaseUrl: string
  // Encryption-as-a-service for user_profiles PII (Vault Transit locally,
  // a cloud KMS in prod) — see adapters/kmsAdapter.ts.
  vault: KmsConfig
  // Keys the OAuth subject hash in user_identities (auth/identityHash.ts)
  // — separate from authSecret (key separation: a leak of one shouldn't
  // compromise the other).
  identityHashKey: string
  // Optional — Google login is a layer on top of anonymous auth, not a
  // requirement to boot (see oauthController.ts).
  googleClientId?: string
  googleClientSecret?: string
  // Test-only override — defaults to the real Google endpoints
  // (googleOAuthAdapter.ts) when omitted; lets integration tests point at
  // a fake in-process Google, mirroring session.integration.test.ts's
  // fake moderation-service.
  googleOAuthEndpoints?: GoogleOAuthEndpoints
}

export interface AppContext {
  // @hono/trpc-server's createContext option is typed to return
  // Record<string, unknown> — an index signature keeps this assignable
  // without losing the named properties' specific types. Note: the
  // property name can't be `env` — @hono/trpc-server unconditionally
  // overwrites an `env` key on the returned context with Hono's own
  // `c.env` (undefined on Bun), clobbering anything we put there.
  [key: string]: unknown
  resHeaders: Headers
  userId: string | null
  appEnv: AppEnv
}

function bearerToken(c: HonoContext): string | null {
  const header = c.req.header('authorization')
  if (!header?.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length)
}

export function createContextFactory(env: AppEnv) {
  return async function createContext(
    opts: FetchCreateContextFnOptions,
    c: HonoContext,
  ): Promise<AppContext> {
    const token = getCookie(c, SESSION_COOKIE_NAME) ?? bearerToken(c)

    const userId = await resolveSession(
      {
        verifyToken: (t) => verifySessionToken(t, env.authSecret),
        touchUser: (userId) => touchUser(env.db, userId),
      },
      token,
    )

    return { resHeaders: opts.resHeaders, userId, appEnv: env }
  }
}
