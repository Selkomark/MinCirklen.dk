import { randomUUID } from 'node:crypto'
import { createSessionToken, verifySessionToken } from '@mincirklen/shared'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { GoogleOAuthError, buildAuthorizationUrl, exchangeCodeForTokens, verifyIdToken } from '../adapters/googleOAuthAdapter'
import { hashIdentitySubject } from '../auth/identityHash'
import { SESSION_COOKIE_NAME, buildSessionCookie, type AppEnv } from '../context'
import { findUserIdByIdentity, linkIdentity } from '../repositories/userIdentityRepository'
import { insertUser, userExists } from '../repositories/userRepository'
import { findUserProfileByUserId } from '../repositories/userProfileRepository'
import { resolveGoogleLogin } from '../services/googleAuthService'

const OAUTH_STATE_COOKIE_NAME = 'mc_oauth_state'
const OAUTH_STATE_MAX_AGE_SECONDS = 600 // 10 minutes
const GOOGLE_PROVIDER = 'google'

function redirectUriFor(env: AppEnv): string {
  return `${env.publicBaseUrl}/api/auth/callback/google`
}

function configFor(env: AppEnv, clientId: string, clientSecret: string) {
  return {
    clientId,
    clientSecret,
    redirectUri: redirectUriFor(env),
    endpoints: env.googleOAuthEndpoints,
  }
}

export function createOAuthController(env: AppEnv): Hono {
  const app = new Hono()

  app.get('/auth/google/start', (c) => {
    // Google login is an optional layer on top of anonymous auth (roadmap's
    // threat model) — trpc-api boots and works without it configured;
    // only this route itself errors.
    if (!env.googleClientId || !env.googleClientSecret) {
      return c.text('Google login is not configured', 503)
    }

    const state = randomUUID()
    setCookie(c, OAUTH_STATE_COOKIE_NAME, state, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    })

    const url = buildAuthorizationUrl(configFor(env, env.googleClientId, env.googleClientSecret), state)

    return c.redirect(url, 302)
  })

  app.get('/auth/callback/google', async (c) => {
    if (!env.googleClientId || !env.googleClientSecret) {
      return c.text('Google login is not configured', 503)
    }

    const stateParam = c.req.query('state')
    const stateCookie = getCookie(c, OAUTH_STATE_COOKIE_NAME)
    deleteCookie(c, OAUTH_STATE_COOKIE_NAME, { path: '/' })

    if (!stateParam || !stateCookie || stateParam !== stateCookie) {
      return c.text('invalid or missing OAuth state', 400)
    }

    const code = c.req.query('code')
    if (!code) {
      return c.text('missing authorization code', 400)
    }

    const config = configFor(env, env.googleClientId, env.googleClientSecret)

    // Read the browser's *current* mc_session, if any — this is how a
    // Google login "upgrades" a user already active in this
    // browser. Read at callback time, not at /start time: a multi-tab
    // race (tab A starts login, tab B creates a fresh anonymous session
    // before A's redirect completes) can upgrade the "wrong" tab's
    // session — a session-confusion edge case, not a security issue
    // (only cookies already in this browser's own jar are ever read).
    const existingToken = getCookie(c, SESSION_COOKIE_NAME)
    const existingUserId = existingToken
      ? (verifySessionToken(existingToken, env.authSecret)?.userId ?? null)
      : null

    let subject: string
    try {
      const { idToken } = await exchangeCodeForTokens(config, code)
      subject = (await verifyIdToken(config, idToken)).subject
    } catch (err) {
      const message = err instanceof GoogleOAuthError ? err.message : 'Google sign-in failed'
      return c.text(message, 400)
    }

    const subjectHash = hashIdentitySubject(subject, env.identityHashKey)

    // An established Google identity always wins over the active
    // anonymous session (see googleAuthService.ts) — if this identity is
    // already linked to a *different* user than whatever's active
    // in the browser, mc_session silently switches to it. Flagged, not
    // fixed, this pass — see the plan for why.
    const { userId, hasProfile } = await resolveGoogleLogin(
      {
        findUserIdByIdentity: () => findUserIdByIdentity(env.db, GOOGLE_PROVIDER, subjectHash),
        createUser: () => insertUser(env.db),
        linkIdentity: (id) => linkIdentity(env.db, id, GOOGLE_PROVIDER, subjectHash),
        hasProfile: async (id) => (await findUserProfileByUserId(env.db, env.vault, id)) !== null,
        userExists: (id) => userExists(env.db, id),
      },
      existingUserId,
    )

    const token = createSessionToken(userId, env.authSecret)
    c.header('set-cookie', buildSessionCookie(token), { append: true })

    // Based on whether a profile actually exists, not on whether the
    // identity link is new — a user who linked Google but abandoned the
    // registration form must be sent back to it on their next login too.
    const destination = hasProfile ? '/new' : '/register?welcome=1'
    return c.redirect(`${env.publicBaseUrl}${destination}`, 302)
  })

  return app
}
