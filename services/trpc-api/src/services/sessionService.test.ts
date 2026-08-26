import { describe, expect, test } from 'bun:test'
import { createSession, getSessionState, joinSession } from './sessionService'

describe('createSession', () => {
  test('delegates to the injected dependency', async () => {
    const result = await createSession({ createSession: async () => ({ id: 's1' }) })
    expect(result).toEqual({ id: 's1' })
  })
})

describe('joinSession', () => {
  test('delegates to the injected dependency', async () => {
    const result = await joinSession({ joinSession: async () => ({ userId: 'p1', turnOrder: 0 }) })
    expect(result).toEqual({ userId: 'p1', turnOrder: 0 })
  })
})

describe('getSessionState', () => {
  test('delegates to the injected dependency, including a null result', async () => {
    expect(await getSessionState({ getSessionState: async () => null })).toBeNull()

    const state = { id: 's1', status: 'forming' as const, currentTurnUserId: null, roster: [] }
    expect(await getSessionState({ getSessionState: async () => state })).toEqual(state)
  })
})
