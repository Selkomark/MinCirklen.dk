import { initTRPC, TRPCError } from '@trpc/server'
import type { AppContext } from '../context'
import { hasLinkedIdentityForUser } from '../repositories/userIdentityRepository'
import { findUserProfileByUserId } from '../repositories/userProfileRepository'
import { isFullyVerified, isGoogleLinked } from '../services/verificationService'

const t = initTRPC.context<AppContext>().create()

export const router = t.router
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } })
})

// A session cookie alone (protectedProcedure) only proves "some browser
// holds a signed token" — createAnonymousSession hands one out with zero
// credentials. This additionally requires a linked Google identity, i.e. a
// real, traceable person. Used wherever a session is about to acquire or
// change real-identity data (currently just auth.completeProfile) but
// hasn't necessarily finished registering yet.
export const googleLinkedProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const linked = await isGoogleLinked({
    hasLinkedIdentity: () => hasLinkedIdentityForUser(ctx.appEnv.db, ctx.userId),
  })
  if (!linked) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Google sign-in required' })
  }
  return next({ ctx })
})

// The operator's actual bar for using the platform: Google-linked AND a
// completed profile (see docs on verificationService.ts for why). Every
// procedure that lets someone actually participate — create/join a
// circle, send a message — must use this, not protectedProcedure.
export const verifiedProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const verified = await isFullyVerified({
    hasLinkedIdentity: () => hasLinkedIdentityForUser(ctx.appEnv.db, ctx.userId),
    hasProfile: () =>
      findUserProfileByUserId(ctx.appEnv.db, ctx.appEnv.vault, ctx.userId).then((profile) => profile !== null),
  })
  if (!verified) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Google sign-in and profile completion required' })
  }
  return next({ ctx })
})
