import { Hono } from 'hono'
import type { AppEnv } from './context'
import { createWsGuard, createWsHandler } from './controllers/wsController'

export function createApp(env: AppEnv): Hono {
  const app = new Hono()

  app.get('/healthz', (c) => c.text('ok'))

  app.get('/ws', createWsGuard(env), createWsHandler(env))

  return app
}
