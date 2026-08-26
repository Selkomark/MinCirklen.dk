import { describe, expect, test } from 'bun:test'
import { getHealth } from './healthService'

describe('getHealth', () => {
  test('reports ok for every check that resolves', async () => {
    const result = await getHealth({
      pingDatabase: async () => {},
      pingRedis: async () => {},
      checkModerationService: async () => {},
    })

    expect(result).toEqual({
      service: 'trpc-api',
      postgres: 'ok',
      redis: 'ok',
      moderationService: 'ok',
    })
  })

  test('describes each failing check independently', async () => {
    const result = await getHealth({
      pingDatabase: async () => {
        throw new Error('connection refused')
      },
      pingRedis: async () => {},
      checkModerationService: async () => {
        throw new Error('status 503')
      },
    })

    expect(result).toEqual({
      service: 'trpc-api',
      postgres: 'unreachable: connection refused',
      redis: 'ok',
      moderationService: 'unreachable: status 503',
    })
  })
})
