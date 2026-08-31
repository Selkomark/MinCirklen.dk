import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { FastifyInstance } from 'fastify'
import { createClient, type Client } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-node'
import { ModerationService } from '@mincirklen/proto'
import { createRpcServer } from './rpcServer'

const SECRET = 'rpc-server-test-secret'

let server: FastifyInstance
let baseUrl: string
let client: Client<typeof ModerationService>

beforeAll(async () => {
  server = createRpcServer(SECRET)
  await server.listen({ host: '127.0.0.1', port: 0 })
  const address = server.server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  baseUrl = `http://127.0.0.1:${port}`
  client = createClient(
    ModerationService,
    createConnectTransport({
      httpVersion: '1.1',
      baseUrl,
      interceptors: [
        (next) => (req) => {
          req.header.set('x-internal-secret', SECRET)
          return next(req)
        },
      ],
    }),
  )
})

afterAll(() => server.close())

describe('classify', () => {
  test('always returns "pass", regardless of input', async () => {
    const res = await client.classify({ sessionId: 'sess-1', message: 'anything' })
    expect(res.result).toBe('pass')
  })
})

describe('auth guard', () => {
  test('rejects a request missing the internal secret header', async () => {
    const unauthedClient = createClient(ModerationService, createConnectTransport({ httpVersion: '1.1', baseUrl }))
    await expect(unauthedClient.classify({ sessionId: 'sess-1', message: 'anything' })).rejects.toThrow()
  })
})

describe('/health', () => {
  test('responds ok without requiring the internal secret', async () => {
    const res = await fetch(`${baseUrl}/health`)
    expect(res.ok).toBe(true)
    expect(await res.text()).toBe('ok')
  })
})
