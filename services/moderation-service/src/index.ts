// STUB SERVICE — always returns "pass". This is deliberately not real
// moderation logic: detection rules, thresholds, and the model itself are
// proprietary and documented separately (tech spec's own scope note, and
// Addendum D of the roadmap). This exists purely so the tRPC API has a real
// gRPC-shaped* dependency to call during local development.
//
// * Uses plain HTTP here, not gRPC, specifically because this is a
//   throwaway placeholder — building real protobuf/gRPC tooling for a stub
//   that will be replaced wholesale by the proprietary service isn't worth
//   the complexity. The real service should speak gRPC per spec section 3.

import { Hono } from 'hono'

interface ClassifyRequest {
  message?: string
  sessionId?: string
}

const app = new Hono()

app.get('/health', (c) => c.text('ok'))

app.post('/classify', async (c) => {
  const body = await c.req.json<ClassifyRequest>().catch(() => ({}) as ClassifyRequest)
  console.log(`[stub] classify called for session=${body.sessionId ?? 'unknown'} — always returning "pass"`)
  return c.json({ result: 'pass' })
})

const port = Number(process.env.PORT ?? 8082)
Bun.serve({ port, fetch: app.fetch })
console.log(`moderation-service (STUB — always passes) listening on :${port}`)
