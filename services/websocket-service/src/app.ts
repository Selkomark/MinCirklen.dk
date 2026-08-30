import { Hono } from 'hono'
import type { AppEnv } from './context'
import { createWsGuard, createWsHandler } from './controllers/wsController'

// trpc-api's internal calls (turn/roster/publish/profile-updated) are no
// longer routed through this Hono app — see rpcServer.ts's Connect/RPC
// listener on its own internal-only port (index.ts starts both).
export function createApp(env: AppEnv): Hono {
  const app = new Hono()

  app.get('/healthz', (c) => c.text('ok'))

  app.get('/ws', createWsGuard(env), createWsHandler(env))

  return app
}
