import { upgradeWebSocket } from 'hono/bun'
import type { Context as HonoContext, MiddlewareHandler } from 'hono'
import { isAllowedOrigin, resolveUserId, type AppEnv } from '../context'
import { subscribeToRoom } from '../adapters/natsAdapter'
import { isSessionMember } from '../repositories/sessionMembershipRepository'
import { isAuthorizedToJoinRoom, relayMessages } from '../services/roomRelayService'

// Runs before the upgrade completes, so an unauthorized request gets a
// plain HTTP error response instead of a WebSocket that immediately
// closes — once upgradeWebSocket's handler runs, the protocol switch has
// already committed.
export function createWsGuard(env: AppEnv): MiddlewareHandler {
  return async (c, next) => {
    if (!isAllowedOrigin(c.req.header('origin') ?? null, env.allowedOrigins)) {
      return c.text('forbidden origin', 403)
    }

    const sessionId = c.req.query('sessionId')
    if (!sessionId) {
      return c.text('sessionId query parameter is required', 400)
    }

    const userId = resolveUserId(c, env.authSecret)
    if (!userId) {
      return c.text('unauthorized', 401)
    }

    const authorized = await isAuthorizedToJoinRoom({
      isSessionMember: () => isSessionMember(env.db, sessionId, userId),
    })
    if (!authorized) {
      return c.text('not a member of this session', 403)
    }

    return next()
  }
}

export function createWsHandler(env: AppEnv) {
  return upgradeWebSocket((c: HonoContext) => {
    // The guard above already validated this — re-reading is cheap and
    // avoids needing typed Hono context variables just to pass it through.
    const sessionId = c.req.query('sessionId') as string

    let unsubscribe: (() => void) | null = null

    return {
      onOpen(_evt, ws) {
        const subscription = subscribeToRoom(env.nats, sessionId)
        unsubscribe = subscription.unsubscribe
        void relayMessages(subscription.messages, (data) => ws.send(data))
      },
      onMessage(_evt, ws) {
        // Delivery-only contract for this milestone — all sends go
        // through trpc-api's session.sendMessage, never directly here.
        ws.send(JSON.stringify({ type: 'error', message: 'this connection is delivery-only; send via trpc-api' }))
      },
      onClose() {
        unsubscribe?.()
      },
    }
  })
}
