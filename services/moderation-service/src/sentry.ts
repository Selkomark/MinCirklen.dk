import * as Sentry from '@sentry/bun'

// Imported first thing in index.ts, before rpcServer.ts's Fastify
// instance is even created — matches "initialize Sentry as early as
// possible". No-ops when SENTRY_DSN is unset, same convention as every
// other service's Sentry setup in this repo (see web-app's
// src/sentry.ts).
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  enableLogs: true,
  // 'warn'/'error' only — see trpc-api/src/app.ts's identical comment for
  // why. Especially relevant here: rpcServer.ts's classify stub
  // console.logs on every single call.
  integrations: [
    Sentry.fastifyIntegration(),
    Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
  ],
})
