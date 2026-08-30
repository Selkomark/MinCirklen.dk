import type { Context as HonoContext, MiddlewareHandler } from 'hono'
import { PRESENCE_STALE_AFTER_SECONDS, TURN_CLAIM_STALE_AFTER_SECONDS } from '@mincirklen/shared'
import type { AppEnv } from '../context'
import { publishMessage, publishPresenceEvent } from '../adapters/natsAdapter'
import { getOnlineUserIds } from '../adapters/redisPresenceAdapter'
import {
  advanceTurn as advanceTurnRedis,
  appendToRoster,
  claimTurn as claimTurnRedis,
  getTurnState as getRedisTurnState,
  releaseTurnClaim as releaseTurnClaimRedis,
  seedTurnState,
} from '../adapters/redisTurnStateAdapter'
import { getPostgresTurnState, writeBackAdvancedTurn, writeBackClaimedTurn } from '../repositories/sessionStateRepository'
import { publishToRoom } from '../services/roomRelayService'
import {
  NotYourTurnError,
  SessionNotFoundError,
  TurnAlreadyClaimedError,
  advanceTurn,
  claimTurn,
  getTurnState,
  joinTurn,
  releaseTurnClaim,
  type TurnServiceDeps,
} from '../services/turnService'

const INTERNAL_SECRET_HEADER = 'x-internal-secret'

// Runs before every /internal/* route — this service is publicly routable
// (docker-compose maps a host port for it, and docs/tech_spec.md puts it on
// the public Load Balancer at socket.mincirklen.dk), unlike
// moderation-service, which is never public — so this surface needs its
// own auth rather than relying on network isolation.
export function createInternalGuard(env: AppEnv): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.header(INTERNAL_SECRET_HEADER) !== env.internalServiceSecret) {
      return c.text('forbidden', 403)
    }
    return next()
  }
}

// trpc-api's only path to fan a chat message out, now that it no longer
// talks to NATS directly (see sessionRouter.ts's sendMessage and
// adapters/websocketServiceAdapter.ts on the trpc-api side).
export function createPublishHandler(env: AppEnv) {
  return async function publishHandler(c: HonoContext): Promise<Response> {
    // Always present — the route pattern is /internal/rooms/:sessionId/publish,
    // so Hono wouldn't have matched this handler otherwise (same `as string`
    // pattern as wsController.ts's already-guard-validated query param).
    const sessionId = c.req.param('sessionId') as string
    const payload = await c.req.json().catch(() => undefined)
    if (payload === undefined) {
      return c.text('invalid JSON body', 400)
    }

    // Typed frame — see wsController.ts's onOpen relay, which now demuxes
    // room-subject frames by `type` rather than assuming every payload is
    // a chat message. `payload` is trpc-api's MessageRow, opaque here.
    publishToRoom({ publish: (p) => publishMessage(env.nats, sessionId, { type: 'message', payload: p }) }, payload)
    return c.body(null, 204)
  }
}

function turnServiceDeps(env: AppEnv): TurnServiceDeps {
  return {
    getRedisTurnState: (sessionId) => getRedisTurnState(env.redis, sessionId),
    seedTurnState: (sessionId, initial) => seedTurnState(env.redis, sessionId, initial),
    appendToRoster: (sessionId, userId, turnOrder) => appendToRoster(env.redis, sessionId, userId, turnOrder),
    claimTurnRedis: (sessionId, userId) =>
      claimTurnRedis(env.redis, sessionId, userId, TURN_CLAIM_STALE_AFTER_SECONDS * 1000),
    releaseTurnClaimRedis: (sessionId) => releaseTurnClaimRedis(env.redis, sessionId),
    advanceTurnRedis: (sessionId) => advanceTurnRedis(env.redis, sessionId, PRESENCE_STALE_AFTER_SECONDS * 1000),
    getPostgresTurnState: (sessionId) => getPostgresTurnState(env.db, sessionId),
  }
}

function mapTurnErrorToResponse(c: HonoContext, err: unknown): Response {
  if (err instanceof SessionNotFoundError) return c.text(err.message, 404)
  if (err instanceof NotYourTurnError) return c.text(err.message, 403)
  if (err instanceof TurnAlreadyClaimedError) return c.text(err.message, 409)
  throw err
}

export function createGetTurnStateHandler(env: AppEnv) {
  return async function getTurnStateHandler(c: HonoContext): Promise<Response> {
    const sessionId = c.req.param('sessionId') as string
    try {
      const state = await getTurnState(turnServiceDeps(env), sessionId)
      // First-paint presence — without this, session.getState's initial
      // fetch would show nobody online until this connection's own
      // subscribe (or someone else's) happens to publish a fresh
      // snapshot. Same "never block on this, but don't leave it stale
      // either" shape as the browse-scope snapshot in wsController.ts's
      // subscribeBrowse.
      const onlineUserIds = await getOnlineUserIds(env.redis, sessionId, Date.now() - PRESENCE_STALE_AFTER_SECONDS * 1000)
      return c.json({ ...state, onlineUserIds })
    } catch (err) {
      return mapTurnErrorToResponse(c, err)
    }
  }
}

export function createJoinTurnHandler(env: AppEnv) {
  return async function joinTurnHandler(c: HonoContext): Promise<Response> {
    const sessionId = c.req.param('sessionId') as string
    const body = await c.req.json().catch(() => null)
    const userId = (body as { userId?: unknown } | null)?.userId
    const turnOrder = (body as { turnOrder?: unknown } | null)?.turnOrder
    if (typeof userId !== 'string' || typeof turnOrder !== 'number') {
      return c.text('userId (string) and turnOrder (number) are required', 400)
    }

    try {
      await joinTurn(turnServiceDeps(env), sessionId, userId, turnOrder)
    } catch (err) {
      return mapTurnErrorToResponse(c, err)
    }

    // Cross-pod fanout so every connected client for this session finds
    // out live, regardless of which pod's /internal/* call actually
    // landed here — see natsAdapter.ts's publishPresenceEvent. Carries
    // turnOrder directly (not just userId) so a client can label the
    // joiner ("Member N") from this event alone — the roster-update
    // frame right below arrives as a separate WS message a moment later,
    // and a client must never depend on it having landed first.
    publishPresenceEvent(env.nats, sessionId, { type: 'participant-joined', sessionId, userId, turnOrder })
    const state = await getRedisTurnState(env.redis, sessionId)
    if (state) {
      publishPresenceEvent(env.nats, sessionId, { type: 'roster-update', sessionId, ...state })
    }

    return c.body(null, 204)
  }
}

export function createClaimTurnHandler(env: AppEnv) {
  return async function claimTurnHandler(c: HonoContext): Promise<Response> {
    const sessionId = c.req.param('sessionId') as string
    const body = await c.req.json().catch(() => null)
    const userId = (body as { userId?: unknown } | null)?.userId
    if (typeof userId !== 'string') {
      return c.text('userId (string) is required', 400)
    }

    try {
      await claimTurn(turnServiceDeps(env), sessionId, userId)
    } catch (err) {
      return mapTurnErrorToResponse(c, err)
    }

    // Fire-and-forget crash-recovery mirror — see
    // sessionStateRepository.ts's writeBackClaimedTurn comment. Must
    // never delay or fail this response: the claim already succeeded in
    // Redis, which is authoritative.
    void writeBackClaimedTurn(env.db, sessionId, new Date()).catch((err) => {
      console.error('[TURN] failed to write back a claimed turn to Postgres', err)
    })

    return c.body(null, 204)
  }
}

export function createReleaseTurnHandler(env: AppEnv) {
  return async function releaseTurnHandler(c: HonoContext): Promise<Response> {
    const sessionId = c.req.param('sessionId') as string
    await releaseTurnClaim(turnServiceDeps(env), sessionId)
    return c.body(null, 204)
  }
}

export function createAdvanceTurnHandler(env: AppEnv) {
  return async function advanceTurnHandler(c: HonoContext): Promise<Response> {
    const sessionId = c.req.param('sessionId') as string
    const nextTurnUserId = await advanceTurn(turnServiceDeps(env), sessionId)

    // Fire-and-forget — see createClaimTurnHandler's identical rationale.
    void writeBackAdvancedTurn(env.db, sessionId, nextTurnUserId).catch((err) => {
      console.error('[TURN] failed to write back an advanced turn to Postgres', err)
    })

    // See createJoinTurnHandler's identical rationale for cross-pod fanout.
    const state = await getRedisTurnState(env.redis, sessionId)
    if (state) {
      publishPresenceEvent(env.nats, sessionId, { type: 'roster-update', sessionId, ...state })
    }

    return c.json({ currentTurnUserId: nextTurnUserId })
  }
}
