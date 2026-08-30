import { describe, expect, test } from 'bun:test'
import type { GuidelinesCheckResult } from '../repositories/sessionRepository'
import {
  checkGuidelines,
  createSession,
  getSessionState,
  getSessionSummary,
  joinSession,
  listOpenSessions,
  listRecentVisits,
  recordGuidelinesAgreement,
  visitSession,
} from './sessionService'

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
  test('returns null without reading turn state when the session does not exist', async () => {
    let turnStateCalled = false
    const result = await getSessionState({
      getSessionStatus: async () => null,
      getTurnState: async () => {
        turnStateCalled = true
        return { currentTurnUserId: null, roster: [], onlineUserIds: [] }
      },
    })
    expect(result).toBeNull()
    expect(turnStateCalled).toBe(false)
  })

  test('composes session status with turn/roster/presence state', async () => {
    const result = await getSessionState({
      getSessionStatus: async () => ({ id: 's1', status: 'active' as const }),
      getTurnState: async () => ({
        currentTurnUserId: 'alice',
        roster: [{ userId: 'alice', turnOrder: 0 }],
        onlineUserIds: ['alice'],
      }),
    })
    expect(result).toEqual({
      id: 's1',
      status: 'active',
      currentTurnUserId: 'alice',
      roster: [{ userId: 'alice', turnOrder: 0 }],
      onlineUserIds: ['alice'],
    })
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

describe('getSessionSummary', () => {
  test('delegates to the injected dependency, including a null result', async () => {
    expect(await getSessionSummary({ getSessionSummary: async () => null })).toBeNull()

    const summary = {
      id: 's1',
      status: 'forming' as const,
      name: null,
      scheduledAt: null,
      durationMinutes: null,
      capacity: null,
      joinedCount: 0,
      topic: null,
    }
    expect(await getSessionSummary({ getSessionSummary: async () => summary })).toEqual(summary)
  })
})

describe('visitSession', () => {
  test('joins, then returns the summary fetched afterward', async () => {
    const summary = {
      id: 's1',
      status: 'active' as const,
      name: 'Grief circle',
      scheduledAt: new Date('2026-09-01T18:00:00.000Z'),
      durationMinutes: 60,
      capacity: 6,
      joinedCount: 1,
      topic: { id: 't1', slug: 'grief', label: 'Grief' },
    }
    let joinCalled = false
    const result = await visitSession({
      joinSession: async () => {
        joinCalled = true
        return { userId: 'p1', turnOrder: 0 }
      },
      getSessionSummary: async () => {
        // The summary fetch must happen after joining, not before — a
        // session that exists only once joinSession has run (impossible
        // in production, but exercised here) would otherwise "not find"
        // it if fetched first.
        expect(joinCalled).toBe(true)
        return summary
      },
    })
    expect(result).toEqual(summary)
  })
})

describe('listRecentVisits', () => {
  test('delegates to the injected dependency', async () => {
    const page = {
      visits: [
        {
          id: 's1',
          status: 'active' as const,
          name: 'Grief circle',
          scheduledAt: new Date('2026-09-01T18:00:00.000Z'),
          durationMinutes: 60,
          topic: { id: 't1', slug: 'grief', label: 'Grief' },
          lastVisitedAt: new Date('2026-09-02T09:00:00.000Z'),
        },
      ],
      nextCursor: null,
    }
    const result = await listRecentVisits({ listRecentSessionVisits: async () => page })
    expect(result).toEqual(page)
  })
})

describe('checkGuidelines', () => {
  test('delegates to the injected dependency, including a partial result', async () => {
    const full: { agreed: boolean; agreedKeys: GuidelinesCheckResult['agreedKeys'] } = {
      agreed: true,
      agreedKeys: ['community_guidelines', 'privacy_policy'],
    }
    expect(await checkGuidelines({ checkAndSyncGuidelines: async () => full })).toEqual(full)

    const partial: typeof full = { agreed: false, agreedKeys: ['community_guidelines'] }
    expect(await checkGuidelines({ checkAndSyncGuidelines: async () => partial })).toEqual(partial)
  })
})

describe('recordGuidelinesAgreement', () => {
  test('records the agreement and reports success', async () => {
    let recorded = false
    const result = await recordGuidelinesAgreement({
      recordGuidelinesAgreement: async () => {
        recorded = true
      },
    })

    expect(recorded).toBe(true)
    expect(result).toEqual({ agreed: true })
  })
})
