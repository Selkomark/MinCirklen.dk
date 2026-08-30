import { Hono } from 'hono'
import type { AppEnv } from './context'
import {
  createAdvanceTurnHandler,
  createClaimTurnHandler,
  createGetTurnStateHandler,
  createInternalGuard,
  createJoinTurnHandler,
  createPublishHandler,
  createReleaseTurnHandler,
} from './controllers/internalController'
import { createWsGuard, createWsHandler } from './controllers/wsController'

export function createApp(env: AppEnv): Hono {
  const app = new Hono()

  app.get('/healthz', (c) => c.text('ok'))

  app.get('/ws', createWsGuard(env), createWsHandler(env))

  const internalGuard = createInternalGuard(env)
  app.post('/internal/rooms/:sessionId/publish', internalGuard, createPublishHandler(env))
  app.get('/internal/sessions/:sessionId/turn', internalGuard, createGetTurnStateHandler(env))
  app.post('/internal/sessions/:sessionId/roster/join', internalGuard, createJoinTurnHandler(env))
  app.post('/internal/sessions/:sessionId/turn/claim', internalGuard, createClaimTurnHandler(env))
  app.post('/internal/sessions/:sessionId/turn/release', internalGuard, createReleaseTurnHandler(env))
  app.post('/internal/sessions/:sessionId/turn/advance', internalGuard, createAdvanceTurnHandler(env))

  return app
}
