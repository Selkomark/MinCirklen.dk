import { fastify, type FastifyInstance } from 'fastify'
import * as Sentry from '@sentry/bun'
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify'
import type { ConnectRouter, Interceptor } from '@connectrpc/connect'
import { ModerationService } from '@mincirklen/proto'

const INTERNAL_SECRET_HEADER = 'x-internal-secret'

// fastifyConnectPlugin catches every handler's thrown error itself to
// format the Connect-protocol wire response — it never lets one escape
// as a Fastify-level exception, so a plain Sentry.setupFastifyErrorHandler
// alone wouldn't see these (see websocket-service/src/rpcServer.ts's
// identical interceptor for the fuller explanation). No known-expected
// error classification exists here at all (unlike that file's
// toConnectError) — this is a stub, so anything thrown is unexpected by
// definition, no filtering needed.
const sentryInterceptor: Interceptor = (next) => async (req) => {
  try {
    return await next(req)
  } catch (err) {
    Sentry.captureException(err)
    throw err
  }
}

// STUB SERVICE — always returns "pass". This is deliberately not real
// moderation logic: detection rules, thresholds, and the model itself are
// proprietary and documented separately (tech spec's own scope note, and
// Addendum D of the roadmap). This exists purely so trpc-api has a real
// Connect/Protobuf-shaped dependency to call during local development —
// see ARCHITECTURE.md's "Internal service-to-service calls" section for
// why every internal call, this one included, speaks Connect rather than
// a hand-rolled REST route.
function routes(): (router: ConnectRouter) => void {
  return (router) =>
    router.service(ModerationService, {
      async classify(req) {
        console.log(`[stub] classify called for session=${req.sessionId || 'unknown'} — always returning "pass"`)
        return { result: 'pass' }
      },
    })
}

// Same secret-header guard as websocket-service's rpcServer.ts. This
// service has no public ingress at all (never published to the host —
// see docker-compose.yml), so the guard is defense-in-depth rather than
// the only thing standing between it and the internet, same reasoning as
// that file's own comment on why the guard exists regardless.
export function createRpcServer(internalServiceSecret: string): FastifyInstance {
  const server = fastify()

  Sentry.setupFastifyErrorHandler(server)

  server.addHook('onRequest', async (request, reply) => {
    // A liveness check must never require the internal secret — mirrors
    // websocket-service's public /healthz being outside its RPC guard.
    if (request.url === '/health') return
    if (request.headers[INTERNAL_SECRET_HEADER] !== internalServiceSecret) {
      await reply.code(403).send('forbidden')
    }
  })

  server.get('/health', async () => 'ok')

  server.register(fastifyConnectPlugin, { routes: routes(), interceptors: [sentryInterceptor] })

  return server
}
