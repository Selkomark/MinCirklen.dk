import { describe, expect, test } from 'bun:test'
import type { Redis } from 'ioredis'
import { pingRedis } from './redisAdapter'

describe('pingRedis', () => {
  test('resolves when the client responds PONG', async () => {
    const fakeRedis = { ping: async () => 'PONG' } as unknown as Redis
    await expect(pingRedis(fakeRedis)).resolves.toBeUndefined()
  })

  test('throws when the client responds with anything else', async () => {
    const fakeRedis = { ping: async () => 'WAT' } as unknown as Redis
    await expect(pingRedis(fakeRedis)).rejects.toThrow('WAT')
  })
})
