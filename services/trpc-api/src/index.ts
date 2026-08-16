import { initTRPC } from '@trpc/server'
import { createHTTPServer } from '@trpc/server/adapters/standalone'
import { z } from 'zod'
import { Redis } from 'ioredis'
import { Pool } from 'pg'

// Scaffolding only, per the tech spec's own build order (IaC before app
// services). This proves the tRPC API boots, reaches Postgres, Redis, and
// the moderation-service stub, and hot-reloads on source changes — real
// auth/session/message-ingestion logic (spec section 4) is future work.

const t = initTRPC.create()

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'redis',
  port: Number(process.env.REDIS_PORT ?? 6379),
  lazyConnect: true,
})
// Without a listener, ioredis's connection-retry errors print as noisy
// "Unhandled error event" spam (e.g. while waiting for the redis container
// to come up in docker compose) — the /health check already surfaces
// connectivity problems, so this just keeps the log quiet.
redis.on('error', () => {})

const pg = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgres://mincirklen:mincirklen@postgres:5432/mincirklen',
})

const moderationServiceUrl = process.env.MODERATION_SVC_URL ?? 'http://moderation-service:8082'

async function checkModerationService(): Promise<string> {
  try {
    const res = await fetch(`${moderationServiceUrl}/health`)
    return res.ok ? 'ok' : `status ${res.status}`
  } catch (err) {
    return `unreachable: ${(err as Error).message}`
  }
}

const appRouter = t.router({
  health: t.procedure.query(async () => {
    const [redisPing, pgResult, moderation] = await Promise.all([
      redis.ping().catch((err: Error) => `unreachable: ${err.message}`),
      pg
        .query('select 1 as ok')
        .then((r) => (r.rows[0]?.ok === 1 ? 'ok' : 'unexpected response'))
        .catch((err: Error) => `unreachable: ${err.message}`),
      checkModerationService(),
    ])

    return {
      service: 'trpc-api',
      redis: redisPing === 'PONG' ? 'ok' : redisPing,
      postgres: pgResult,
      moderationService: moderation,
    }
  }),

  echo: t.procedure.input(z.object({ message: z.string() })).mutation(({ input }) => {
    return { echoed: input.message }
  }),
})

export type AppRouter = typeof appRouter

const port = Number(process.env.PORT ?? 8787)
createHTTPServer({ router: appRouter }).listen(port)
console.log(`trpc-api listening on :${port}`)
