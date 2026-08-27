import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createSessionInputSchema, listOpenSessionsInputSchema } from '@mincirklen/shared'
import { classifyMessage } from '../adapters/moderationServiceAdapter'
import { publishMessage } from '../adapters/natsAdapter'
import { insertModerationEvent } from '../repositories/moderationEventRepository'
import {
  listMessages as listMessagesRepo,
  recordFlaggedMessage,
  recordPassedMessage,
} from '../repositories/messageRepository'
import {
  NotYourTurnError,
  SessionFullError,
  SessionNotFoundError,
  TurnAlreadyClaimedError,
  claimTurn,
  createSession as createSessionRepo,
  getSessionState as getSessionStateRepo,
  isSessionMember,
  joinSession as joinSessionRepo,
  listOpenSessions as listOpenSessionsRepo,
  releaseTurnClaim,
} from '../repositories/sessionRepository'
import { escalate } from '../services/crisisEscalationService'
import { NotAMemberError, sendMessage as sendMessageService } from '../services/messageService'
import * as sessionService from '../services/sessionService'
import { router, verifiedProcedure } from './trpc'

function toTRPCError(err: unknown): TRPCError {
  if (err instanceof NotAMemberError || err instanceof NotYourTurnError) {
    return new TRPCError({ code: 'FORBIDDEN', message: err.message })
  }
  if (err instanceof TurnAlreadyClaimedError) {
    return new TRPCError({ code: 'CONFLICT', message: err.message })
  }
  if (err instanceof SessionFullError) {
    return new TRPCError({ code: 'CONFLICT', message: err.message })
  }
  if (err instanceof SessionNotFoundError) {
    return new TRPCError({ code: 'NOT_FOUND', message: err.message })
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause: err })
}

const sessionIdInput = z.object({ sessionId: z.string().uuid() })

export const sessionRouter = router({
  create: verifiedProcedure.input(createSessionInputSchema).mutation(async ({ ctx, input }) => {
    return sessionService.createSession({
      createSession: () =>
        createSessionRepo(
          ctx.appEnv.db,
          input.scheduled
            ? {
                topicId: input.topicId,
                name: input.name,
                scheduledAt: input.scheduledAt,
                durationMinutes: input.durationMinutes,
                capacity: input.capacity,
              }
            : undefined,
        ),
    })
  }),

  listOpen: verifiedProcedure.input(listOpenSessionsInputSchema).query(async ({ ctx, input }) => {
    return sessionService.listOpenSessions({ listOpenSessions: () => listOpenSessionsRepo(ctx.appEnv.db, input) })
  }),

  join: verifiedProcedure.input(sessionIdInput).mutation(async ({ ctx, input }) => {
    try {
      return await sessionService.joinSession({
        joinSession: () => joinSessionRepo(ctx.appEnv.db, input.sessionId, ctx.userId),
      })
    } catch (err) {
      throw toTRPCError(err)
    }
  }),

  getState: verifiedProcedure.input(sessionIdInput).query(async ({ ctx, input }) => {
    if (!(await isSessionMember(ctx.appEnv.db, input.sessionId, ctx.userId))) {
      throw toTRPCError(new NotAMemberError('user is not a member of this session'))
    }
    return sessionService.getSessionState({
      getSessionState: () => getSessionStateRepo(ctx.appEnv.db, input.sessionId),
    })
  }),

  listMessages: verifiedProcedure.input(sessionIdInput).query(async ({ ctx, input }) => {
    if (!(await isSessionMember(ctx.appEnv.db, input.sessionId, ctx.userId))) {
      throw toTRPCError(new NotAMemberError('user is not a member of this session'))
    }
    return listMessagesRepo(ctx.appEnv.db, input.sessionId)
  }),

  sendMessage: verifiedProcedure
    .input(sessionIdInput.extend({ body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { db, nats, moderationServiceUrl } = ctx.appEnv
      const { sessionId } = input
      const userId = ctx.userId

      try {
        return await sendMessageService(
          {
            isSessionMember: () => isSessionMember(db, sessionId, userId),
            claimTurn: () => claimTurn(db, sessionId, userId),
            releaseTurnClaim: () => releaseTurnClaim(db, sessionId),
            classify: (body) => classifyMessage(moderationServiceUrl, { sessionId, message: body }),
            recordPassedMessage: (body) => recordPassedMessage(db, { sessionId, userId, body }),
            recordFlaggedMessage: () => recordFlaggedMessage(db, { sessionId, userId }),
            escalateCrisis: () =>
              escalate(
                {
                  insertModerationEvent: () =>
                    insertModerationEvent(db, {
                      sessionId,
                      userId,
                      messageId: null,
                      classification: 'crisis',
                    }),
                  logEscalation: (params) => console.error('[ESCALATION] crisis flagged', params),
                  logCriticalFailure: (err, params) =>
                    console.error('[ESCALATION][CRITICAL] failed to persist crisis event', params, err),
                },
                { sessionId, userId },
              ),
            publish: (message) => publishMessage(nats, sessionId, message),
          },
          input.body,
        )
      } catch (err) {
        throw toTRPCError(err)
      }
    }),
})
