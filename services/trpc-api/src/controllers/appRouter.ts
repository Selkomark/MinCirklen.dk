import { authRouter } from './authRouter'
import { sessionRouter } from './sessionRouter'
import { router } from './trpc'

export const appRouter = router({
  auth: authRouter,
  session: sessionRouter,
})

export type AppRouter = typeof appRouter
