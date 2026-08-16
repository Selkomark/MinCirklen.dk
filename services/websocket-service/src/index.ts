import { Redis } from 'ioredis'
import { connect, type NatsConnection } from 'nats'

// Scaffolding only (see trpc-api's src/index.ts for the same note). Proves
// the WebSocket service boots, reaches Redis and NATS, accepts a WS
// connection, and hot-reloads. Real round-robin turn delivery and
// cross-pod fanout via NATS (spec section 3) is future work.

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'redis',
  port: Number(process.env.REDIS_PORT ?? 6379),
  lazyConnect: true,
})
// See trpc-api's src/index.ts — same noisy-retry-log issue, same fix.
redis.on('error', () => {})

let nc: NatsConnection | undefined
try {
  nc = await connect({ servers: process.env.NATS_URL ?? 'nats://nats:4222' })
  console.log(`Connected to NATS: ${nc.info?.server_id ?? 'unknown'}`)
} catch (err) {
  console.error(`NATS connection failed (continuing without it): ${(err as Error).message}`)
}

const port = Number(process.env.PORT ?? 8080)

Bun.serve({
  port,
  fetch(req, server) {
    const url = new URL(req.url)

    if (url.pathname === '/healthz') {
      return new Response('ok')
    }

    if (server.upgrade(req)) {
      return undefined
    }
    return new Response('Upgrade required', { status: 426 })
  },
  websocket: {
    open(ws) {
      ws.send(JSON.stringify({ type: 'welcome', service: 'websocket-service' }))
    },
    async message(ws, message) {
      const redisStatus = await redis.ping().catch((err: Error) => `unreachable: ${err.message}`)
      ws.send(JSON.stringify({ type: 'echo', message: message.toString(), redis: redisStatus }))
    },
  },
})

console.log(`websocket-service listening on :${port}`)
