import { authRouter } from './authRouter'
import { sessionRouter } from './sessionRouter'
import { topicRouter } from './topicRouter'
import { router } from './trpc'

export const appRouter = router({
  auth: authRouter,
  session: sessionRouter,
  topics: topicRouter,
})

export type AppRouter = typeof appRouter
