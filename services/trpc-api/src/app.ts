import { Hono } from 'hono'
import { trpcServer } from '@hono/trpc-server'
import { appRouter } from './controllers/appRouter'
import { createHealthHandler } from './controllers/healthController'
import { createOAuthController } from './controllers/oauthController'
import { createContextFactory, type AppEnv } from './context'

export function createApp(env: AppEnv): Hono {
  const app = new Hono()

  app.get('/health', createHealthHandler(env))
  app.route('/', createOAuthController(env))

  app.use(
    '/trpc/*',
    trpcServer({
      router: appRouter,
      endpoint: '/trpc',
      createContext: createContextFactory(env),
    }),
  )

  return app
}
