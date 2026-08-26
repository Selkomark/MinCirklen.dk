import type { Classification } from '@mincirklen/shared'
import type { MessageRow } from '../repositories/messageRepository'
import type { CrisisResource } from './crisisEscalationService'

// Explicit constructor: see the same note in repositories/sessionRepository.ts.
export class NotAMemberError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export interface SentResult {
  status: 'sent'
  message: MessageRow
}

export interface HeldResult {
  status: 'held'
}

export interface CrisisResult {
  status: 'crisis'
  resource: CrisisResource
}

export type SendMessageResult = SentResult | HeldResult | CrisisResult

export interface SendMessageDeps {
  isSessionMember(): Promise<boolean>
  claimTurn(): Promise<void>
  releaseTurnClaim(): Promise<void>
  classify(body: string): Promise<Classification>
  // Each of these three maps 1:1 to a single atomic Repository/Service call
  // the controller wires up — see services/trpc-api/src/repositories/messageRepository.ts
  // for how the 'pass'/'flag' cases stay transactional across tables.
  recordPassedMessage(body: string): Promise<MessageRow>
  recordFlaggedMessage(): Promise<void>
  escalateCrisis(): Promise<CrisisResource>
  publish(message: MessageRow): void
}

export async function sendMessage(deps: SendMessageDeps, body: string): Promise<SendMessageResult> {
  if (!(await deps.isSessionMember())) {
    throw new NotAMemberError('user is not a member of this session')
  }

  await deps.claimTurn()

  let classification: Classification
  try {
    classification = await deps.classify(body)
  } catch (err) {
    // Fail closed: an unclassifiable message never falls through to
    // "sent" — release the claim so the sender can retry, and propagate.
    await deps.releaseTurnClaim()
    throw err
  }

  switch (classification) {
    case 'pass': {
      const message = await deps.recordPassedMessage(body)
      deps.publish(message)
      return { status: 'sent', message }
    }
    case 'flag': {
      await deps.recordFlaggedMessage()
      return { status: 'held' }
    }
    case 'crisis': {
      // Turn intentionally not advanced — see crisisEscalationService.ts
      // and the plan's rationale (give space rather than force the next
      // speaker forward).
      const resource = await deps.escalateCrisis()
      return { status: 'crisis', resource }
    }
    default: {
      // Compile-time exhaustiveness check, not a separate helper function —
      // TS rejects this assignment if a Classification value ever stops
      // being handled above. Not reachable at runtime with a valid
      // Classification; see moderationServiceAdapter.classifyMessage's
      // fail-closed parsing for why nothing else can reach here.
      const unreachable: never = classification
      throw new Error(`unexpected classification: ${JSON.stringify(unreachable)}`)
    }
  }
}
