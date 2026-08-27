import { createDb, createPgPool, runMigrations } from '@mincirklen/shared'
import { Redis } from 'ioredis'
import { connect } from 'nats'
import { createApp } from './app'
import type { KmsConfig } from './adapters/kmsAdapter'

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'redis',
  port: Number(process.env.REDIS_PORT ?? 6379),
  lazyConnect: true,
})
// Without a listener, ioredis's connection-retry errors print as noisy
// "Unhandled error event" spam (e.g. while waiting for the redis container
// to come up in docker compose) — /health already surfaces connectivity
// problems, so this just keeps the log quiet.
redis.on('error', () => {})

// Never `public` — see packages/shared/src/db/pool.ts and docs/local_dev.md.
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

// KMS_PROVIDER unset/"vault" -> local dev's Vault Transit engine (see
// docker-compose.yml); "gcp" -> Cloud KMS in production (see
// IaC/modules/kms). See adapters/kmsAdapter.ts for what each needs.
const kmsProvider = process.env.KMS_PROVIDER ?? 'vault'
let kms: KmsConfig
if (kmsProvider === 'gcp') {
  const keyName = process.env.KMS_KEY_NAME
  if (!keyName) {
    throw new Error('KMS_KEY_NAME is required when KMS_PROVIDER=gcp')
  }
  kms = { provider: 'gcp', keyName }
} else if (kmsProvider === 'vault') {
  const vaultAddr = process.env.VAULT_ADDR
  const vaultToken = process.env.VAULT_TOKEN
  if (!vaultAddr || !vaultToken) {
    throw new Error('VAULT_ADDR and VAULT_TOKEN are required when KMS_PROVIDER=vault')
  }
  kms = { provider: 'vault', vaultAddr, vaultToken }
} else {
  throw new Error(`unknown KMS_PROVIDER "${kmsProvider}" (expected "vault" or "gcp")`)
}

const identityHashKey = process.env.IDENTITY_HASH_KEY
if (!identityHashKey) {
  throw new Error('IDENTITY_HASH_KEY is required')
}

await runMigrations(db, dbSchema)

// Unlike Redis above, NATS is load-bearing for the send pipeline (message
// fanout) — an instance that can't publish shouldn't report itself healthy,
// so a boot-time connection failure is fatal rather than swallowed.
const nats = await connect({ servers: process.env.NATS_URL ?? 'nats://nats:4222' })

const app = createApp({
  db,
  redis,
  nats,
  authSecret,
  moderationServiceUrl: process.env.MODERATION_SVC_URL ?? 'http://moderation-service:8082',
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'https://dev-mincirklen.dk',
  vault: kms,
  identityHashKey,
  // Optional — Google login layers on top of anonymous auth, it isn't
  // required to boot. See docs/local_dev.md / setup-oauth-env.sh.
  googleClientId: process.env.GOOGLE_CLIENT_ID || undefined,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || undefined,
})

const port = Number(process.env.PORT ?? 8787)
Bun.serve({ port, fetch: app.fetch })
console.log(`trpc-api listening on :${port}`)
