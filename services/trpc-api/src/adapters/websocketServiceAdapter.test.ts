import { afterEach, describe, expect, test } from 'bun:test'
import type { MessageRow } from '../repositories/messageRepository'
import { NotYourTurnError, SessionNotFoundError, TurnAlreadyClaimedError } from '../repositories/sessionRepository'
import {
  WebsocketServiceError,
  advanceTurn,
  checkWebsocketServiceHealth,
  claimTurn,
  getTurnState,
  notifyJoined,
  publishMessage,
  releaseTurnClaim,
} from './websocketServiceAdapter'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('WebsocketServiceError', () => {
  test('is a real Error subclass', () => {
    const err = new WebsocketServiceError('boom')
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('boom')
  })
})

describe('checkWebsocketServiceHealth', () => {
  test('resolves when the health endpoint responds ok', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 200 })) as unknown as typeof fetch
    await expect(checkWebsocketServiceHealth('http://websocket.invalid')).resolves.toBeUndefined()
  })

  test('throws with the status code when the response is not ok', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch
    await expect(checkWebsocketServiceHealth('http://websocket.invalid')).rejects.toThrow('status 503')
  })
})

describe('publishMessage', () => {
  const message: MessageRow = {
    id: '11111111-1111-1111-1111-111111111111',
    sessionId: '22222222-2222-2222-2222-222222222222',
    userId: '33333333-3333-3333-3333-333333333333',
    body: 'hi',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }

  test('POSTs to the session-scoped publish route with the internal secret header', async () => {
    let capturedUrl: string | undefined
    let capturedInit: RequestInit | undefined
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      capturedUrl = url
      capturedInit = init
      return new Response(null, { status: 204 })
    }) as unknown as typeof fetch

    await publishMessage('http://websocket.invalid', 'shh-secret', message.sessionId, message)

    expect(capturedUrl).toBe(`http://websocket.invalid/internal/rooms/${message.sessionId}/publish`)
    expect(capturedInit?.method).toBe('POST')
    const headers = capturedInit?.headers as Record<string, string>
    expect(headers['x-internal-secret']).toBe('shh-secret')
    expect(headers['content-type']).toBe('application/json')
    expect(JSON.parse(capturedInit?.body as string)).toEqual({ ...message, createdAt: message.createdAt.toISOString() })
  })

  test('throws when the response is not ok', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch
    await expect(publishMessage('http://websocket.invalid', 'shh-secret', message.sessionId, message)).rejects.toThrow(
      'status 503',
    )
  })

  test('throws on a network failure', async () => {
    globalThis.fetch = (async () => {
      throw new Error('connection refused')
    }) as unknown as typeof fetch
    await expect(publishMessage('http://websocket.invalid', 'shh-secret', message.sessionId, message)).rejects.toThrow(
      'connection refused',
    )
  })
})

const SESSION_ID = '22222222-2222-2222-2222-222222222222'

describe('getTurnState', () => {
  test('GETs the session-scoped turn route and returns the parsed state', async () => {
    let capturedUrl: string | undefined
    let capturedInit: RequestInit | undefined
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      capturedUrl = url
      capturedInit = init
      return Response.json({ currentTurnUserId: 'alice', roster: [{ userId: 'alice', turnOrder: 0 }], onlineUserIds: ['alice'] })
    }) as unknown as typeof fetch

    const state = await getTurnState('http://websocket.invalid', 'shh-secret', SESSION_ID)

    expect(capturedUrl).toBe(`http://websocket.invalid/internal/sessions/${SESSION_ID}/turn`)
    expect((capturedInit?.headers as Record<string, string>)['x-internal-secret']).toBe('shh-secret')
    expect(state).toEqual({ currentTurnUserId: 'alice', roster: [{ userId: 'alice', turnOrder: 0 }], onlineUserIds: ['alice'] })
  })

  test('maps 404 to SessionNotFoundError', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch
    await expect(getTurnState('http://websocket.invalid', 'shh-secret', SESSION_ID)).rejects.toThrow(SessionNotFoundError)
  })

  test('throws WebsocketServiceError for anything else unrecognized', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch
    await expect(getTurnState('http://websocket.invalid', 'shh-secret', SESSION_ID)).rejects.toThrow(WebsocketServiceError)
  })
})

describe('notifyJoined', () => {
  test('POSTs the new member to the roster/join route', async () => {
    let capturedUrl: string | undefined
    let capturedBody: string | undefined
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      capturedUrl = url
      capturedBody = init.body as string
      return new Response(null, { status: 204 })
    }) as unknown as typeof fetch

    await notifyJoined('http://websocket.invalid', 'shh-secret', SESSION_ID, 'alice', 0)

    expect(capturedUrl).toBe(`http://websocket.invalid/internal/sessions/${SESSION_ID}/roster/join`)
    expect(JSON.parse(capturedBody as string)).toEqual({ userId: 'alice', turnOrder: 0 })
  })

  test('maps 404 to SessionNotFoundError', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch
    await expect(notifyJoined('http://websocket.invalid', 'shh-secret', SESSION_ID, 'alice', 0)).rejects.toThrow(
      SessionNotFoundError,
    )
  })
})

describe('claimTurn', () => {
  test('POSTs to the claim route', async () => {
    let capturedUrl: string | undefined
    globalThis.fetch = (async (url: string) => {
      capturedUrl = url
      return new Response(null, { status: 204 })
    }) as unknown as typeof fetch

    await claimTurn('http://websocket.invalid', 'shh-secret', SESSION_ID, 'alice')
    expect(capturedUrl).toBe(`http://websocket.invalid/internal/sessions/${SESSION_ID}/turn/claim`)
  })

  test('maps 403 to NotYourTurnError', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 403 })) as unknown as typeof fetch
    await expect(claimTurn('http://websocket.invalid', 'shh-secret', SESSION_ID, 'alice')).rejects.toThrow(NotYourTurnError)
  })

  test('maps 409 to TurnAlreadyClaimedError', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 409 })) as unknown as typeof fetch
    await expect(claimTurn('http://websocket.invalid', 'shh-secret', SESSION_ID, 'alice')).rejects.toThrow(
      TurnAlreadyClaimedError,
    )
  })

  test('maps 404 to SessionNotFoundError', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch
    await expect(claimTurn('http://websocket.invalid', 'shh-secret', SESSION_ID, 'alice')).rejects.toThrow(SessionNotFoundError)
  })
})

describe('releaseTurnClaim', () => {
  test('POSTs to the release route', async () => {
    let capturedUrl: string | undefined
    globalThis.fetch = (async (url: string) => {
      capturedUrl = url
      return new Response(null, { status: 204 })
    }) as unknown as typeof fetch

    await releaseTurnClaim('http://websocket.invalid', 'shh-secret', SESSION_ID)
    expect(capturedUrl).toBe(`http://websocket.invalid/internal/sessions/${SESSION_ID}/turn/release`)
  })
})

describe('advanceTurn', () => {
  test('POSTs to the advance route', async () => {
    let capturedUrl: string | undefined
    globalThis.fetch = (async (url: string) => {
      capturedUrl = url
      return Response.json({ currentTurnUserId: 'bob' })
    }) as unknown as typeof fetch

    await advanceTurn('http://websocket.invalid', 'shh-secret', SESSION_ID)
    expect(capturedUrl).toBe(`http://websocket.invalid/internal/sessions/${SESSION_ID}/turn/advance`)
  })

  test('maps 404 to SessionNotFoundError', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch
    await expect(advanceTurn('http://websocket.invalid', 'shh-secret', SESSION_ID)).rejects.toThrow(SessionNotFoundError)
  })
})
