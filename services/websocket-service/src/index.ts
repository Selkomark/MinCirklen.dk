import { createDb, createPgPool } from '@mincirklen/shared'
import { websocket } from 'hono/bun'
import { connect } from 'nats'
import { createApp } from './app'

// Never `public` — see packages/shared/src/db/pool.ts and docs/local_dev.md.
// Not running its own migrations (trpc-api does), so `dbSchema` isn't
// passed to runMigrations here — only used to point the pool's search_path
// at the same schema trpc-api migrated.
const dbSchema = process.env.DB_SCHEMA ?? 'dev'
const pool = createPgPool(
  process.env.DATABASE_URL ?? 'postgres://mincirklen:mincirklen@postgres:5432/mincirklen',
  dbSchema,
)
const db = createDb(pool)

const authSecret = process.env.AUTH_SECRET
if (!authSecret) {
  throw new Error('AUTH_SECRET is required')
}

// Load-bearing for fanout (see trpc-api's src/index.ts for the same note)
// — a boot-time connection failure is fatal rather than swallowed.
const nats = await connect({ servers: process.env.NATS_URL ?? 'nats://nats:4222' })

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const app = createApp({ db, nats, authSecret, allowedOrigins })

const port = Number(process.env.PORT ?? 8080)
Bun.serve({ port, fetch: app.fetch, websocket })
console.log(`websocket-service listening on :${port}`)
