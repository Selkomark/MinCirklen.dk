import { createSessionToken, createUserProfileInputSchema } from '@mincirklen/shared'
import { insertUser } from '../repositories/userRepository'
import { hasLinkedIdentityForUser } from '../repositories/userIdentityRepository'
import { findUserProfileByUserId, upsertUserProfile } from '../repositories/userProfileRepository'
import { createAnonymousSession } from '../services/authService'
import { completeUserProfile } from '../services/userProfileService'
import { buildSessionCookie } from '../context'
import { googleLinkedProcedure, protectedProcedure, publicProcedure, router } from './trpc'

export const authRouter = router({
  createAnonymousSession: publicProcedure.mutation(async ({ ctx }) => {
    const result = await createAnonymousSession({
      insertUser: () => insertUser(ctx.appEnv.db),
      createToken: (userId) => createSessionToken(userId, ctx.appEnv.authSecret),
    })

    ctx.resHeaders.append('set-cookie', buildSessionCookie(result.token))

    return result
  }),

  whoAmI: protectedProcedure.query(({ ctx }) => ({ userId: ctx.userId })),

  // The full picture the frontend's auth gate needs (App.tsx): a bare
  // session from createAnonymousSession alone answers neither question —
  // `hasLinkedIdentity: false` means "still needs Google," `profile: null`
  // (with `hasLinkedIdentity: true`) means "Google done, still needs
  // RegisterPage.tsx." Only `hasLinkedIdentity && profile` means the
  // operator's actual bar for using the platform is met — see
  // verificationService.ts.
  myProfile: protectedProcedure.query(async ({ ctx }) => {
    const [hasLinkedIdentity, profile] = await Promise.all([
      hasLinkedIdentityForUser(ctx.appEnv.db, ctx.userId),
      findUserProfileByUserId(ctx.appEnv.db, ctx.appEnv.vault, ctx.userId),
    ])

    return { hasLinkedIdentity, profile }
  }),

  // The post-login registration page (RegisterPage.tsx) — collects
  // opt-in identity info into `user_profiles`, separate from `users`.
  // googleLinkedProcedure, not protectedProcedure: a bare anonymous
  // session must never be able to "complete" a profile without ever
  // proving it's a real, traceable person via Google first.
  completeProfile: googleLinkedProcedure.input(createUserProfileInputSchema).mutation(async ({ ctx, input }) => {
    const profile = await completeUserProfile(
      {
        upsertUserProfile: (params) => upsertUserProfile(ctx.appEnv.db, ctx.appEnv.vault, { userId: ctx.userId, ...params }),
      },
      input,
    )

    return profile
  }),
})
