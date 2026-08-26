import { describe, expect, test } from 'bun:test'
import type { MessageRow } from '../repositories/messageRepository'
import type { CrisisResource } from './crisisEscalationService'
import { NotAMemberError, sendMessage, type SendMessageDeps } from './messageService'

const message: MessageRow = {
  id: 'm1',
  sessionId: 's1',
  userId: 'p1',
  body: 'hello',
  createdAt: new Date('2026-01-01T00:00:00Z'),
}

const resource: CrisisResource = { type: 'crisis_resource', message: 'x', resources: [] }

function trackedDeps(overrides: Partial<SendMessageDeps> & { classification?: 'pass' | 'flag' | 'crisis' }) {
  const calls: string[] = []
  const classification = overrides.classification ?? 'pass'

  const deps: SendMessageDeps = {
    isSessionMember: async () => {
      calls.push('isSessionMember')
      return true
    },
    claimTurn: async () => {
      calls.push('claimTurn')
    },
    releaseTurnClaim: async () => {
      calls.push('releaseTurnClaim')
    },
    classify: async () => {
      calls.push('classify')
      return classification
    },
    recordPassedMessage: async () => {
      calls.push('recordPassedMessage')
      return message
    },
    recordFlaggedMessage: async () => {
      calls.push('recordFlaggedMessage')
    },
    escalateCrisis: async () => {
      calls.push('escalateCrisis')
      return resource
    },
    publish: () => {
      calls.push('publish')
    },
    ...overrides,
  }

  return { deps, calls }
}

describe('sendMessage', () => {
  test('rejects a non-member before claiming a turn or classifying', async () => {
    const { deps, calls } = trackedDeps({
      isSessionMember: async () => {
        calls.push('isSessionMember')
        return false
      },
    })

    await expect(sendMessage(deps, 'hi')).rejects.toBeInstanceOf(NotAMemberError)
    expect(calls).toEqual(['isSessionMember'])
  })

  test('propagates a claimTurn failure without classifying', async () => {
    const { deps, calls } = trackedDeps({
      claimTurn: async () => {
        calls.push('claimTurn')
        throw new Error('not your turn')
      },
    })

    await expect(sendMessage(deps, 'hi')).rejects.toThrow('not your turn')
    expect(calls).toEqual(['isSessionMember', 'claimTurn'])
  })

  test('releases the claim and propagates when classification fails — fail closed, never falls through to sent', async () => {
    const { deps, calls } = trackedDeps({
      classify: async () => {
        calls.push('classify')
        throw new Error('moderation service unreachable')
      },
    })

    await expect(sendMessage(deps, 'hi')).rejects.toThrow('moderation service unreachable')
    expect(calls).toEqual(['isSessionMember', 'claimTurn', 'classify', 'releaseTurnClaim'])
  })

  test('"pass": records and publishes the message, never touches the flag/crisis paths', async () => {
    const { deps, calls } = trackedDeps({ classification: 'pass' })

    const result = await sendMessage(deps, 'hi')

    expect(result).toEqual({ status: 'sent', message })
    expect(calls).toEqual(['isSessionMember', 'claimTurn', 'classify', 'recordPassedMessage', 'publish'])
  })

  test('"flag": holds the message back, never persists or publishes it', async () => {
    const { deps, calls } = trackedDeps({ classification: 'flag' })

    const result = await sendMessage(deps, 'hi')

    expect(result).toEqual({ status: 'held' })
    expect(calls).toEqual(['isSessionMember', 'claimTurn', 'classify', 'recordFlaggedMessage'])
  })

  test('"crisis": escalates unconditionally, never persists a message or publishes', async () => {
    const { deps, calls } = trackedDeps({ classification: 'crisis' })

    const result = await sendMessage(deps, 'hi')

    expect(result).toEqual({ status: 'crisis', resource })
    expect(calls).toEqual(['isSessionMember', 'claimTurn', 'classify', 'escalateCrisis'])
    expect(calls).not.toContain('recordPassedMessage')
    expect(calls).not.toContain('publish')
  })
})
