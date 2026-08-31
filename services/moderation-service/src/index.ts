import './sentry'
import { createRpcServer } from './rpcServer'

const internalServiceSecret = process.env.INTERNAL_SERVICE_SECRET
if (!internalServiceSecret) {
  throw new Error('INTERNAL_SERVICE_SECRET is required')
}

const port = Number(process.env.PORT ?? 8082)
await createRpcServer(internalServiceSecret).listen({ host: '0.0.0.0', port })
console.log(`moderation-service (STUB — always passes) listening on :${port}`)
