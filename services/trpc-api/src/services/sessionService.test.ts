import { describe, expect, test } from 'bun:test'
import { createSession, getSessionState, joinSession, listOpenSessions } from './sessionService'

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

describe('listOpenSessions', () => {
  test('delegates to the injected dependency', async () => {
    const page = {
      sessions: [
        {
          id: 's1',
          status: 'forming' as const,
          name: 'Weekly grief circle',
          scheduledAt: new Date('2026-09-01T18:00:00.000Z'),
          durationMinutes: 60,
          capacity: 6,
          joinedCount: 1,
          topic: { id: 't1', slug: 'grief', label: 'Grief' },
        },
      ],
      nextCursor: 'schedule|2026-09-01T18:00:00.000Z|s1',
      prevCursor: null,
    }
    const result = await listOpenSessions({ listOpenSessions: async () => page })
    expect(result).toEqual(page)
  })
})
