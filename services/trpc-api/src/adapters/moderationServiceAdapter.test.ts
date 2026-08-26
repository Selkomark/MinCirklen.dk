import { afterEach, describe, expect, test } from 'bun:test'
import { ModerationServiceError, checkModerationServiceHealth, classifyMessage } from './moderationServiceAdapter'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('ModerationServiceError', () => {
  test('is a real Error subclass', () => {
    const err = new ModerationServiceError('boom')
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('boom')
  })
})

describe('checkModerationServiceHealth', () => {
  test('resolves when the health endpoint responds ok', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 200 })) as unknown as typeof fetch
    await expect(checkModerationServiceHealth('http://moderation.invalid')).resolves.toBeUndefined()
  })

  test('throws with the status code when the response is not ok', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch
    await expect(checkModerationServiceHealth('http://moderation.invalid')).rejects.toThrow('status 503')
  })
})

describe('classifyMessage', () => {
  const params = { sessionId: '11111111-1111-1111-1111-111111111111', message: 'hi' }

  test.each(['pass', 'flag', 'crisis'] as const)('resolves "%s" from a valid response', async (result) => {
    globalThis.fetch = (async () => Response.json({ result })) as unknown as typeof fetch
    await expect(classifyMessage('http://moderation.invalid', params)).resolves.toBe(result)
  })

  test('throws when the response is not ok', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch
    await expect(classifyMessage('http://moderation.invalid', params)).rejects.toThrow('status 503')
  })

  test('throws when the body is not valid JSON', async () => {
    globalThis.fetch = (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch
    await expect(classifyMessage('http://moderation.invalid', params)).rejects.toThrow(
      'unrecognized classification',
    )
  })

  test('throws when the classification is not one of the known values', async () => {
    globalThis.fetch = (async () => Response.json({ result: 'maybe' })) as unknown as typeof fetch
    await expect(classifyMessage('http://moderation.invalid', params)).rejects.toThrow(
      'unrecognized classification',
    )
  })

  test('throws on a network failure', async () => {
    globalThis.fetch = (async () => {
      throw new Error('connection refused')
    }) as unknown as typeof fetch
    await expect(classifyMessage('http://moderation.invalid', params)).rejects.toThrow('connection refused')
  })
})
