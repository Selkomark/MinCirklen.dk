import { createSessionToken, createUserProfileInputSchema } from '@mincirklen/shared'
import { insertUser } from '../repositories/userRepository'
import { hasLinkedIdentityForUser } from '../repositories/userIdentityRepository'
import { findUserProfileByUserId, upsertUserProfile, userProfileExists } from '../repositories/userProfileRepository'
import { KmsError } from '../adapters/kmsAdapter'
import { createAnonymousSession } from '../services/authService'
import { completeUserProfile } from '../services/userProfileService'
import { buildLogoutCookie, buildSessionCookie } from '../context'
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

  // publicProcedure, not protectedProcedure: logging out must never itself
  // fail — an already-expired or missing session cookie is exactly the
  // state this is meant to end up in anyway, so there's nothing to guard.
  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.resHeaders.append('set-cookie', buildLogoutCookie())
    return { ok: true }
  }),

  whoAmI: protectedProcedure.query(({ ctx }) => ({ userId: ctx.userId })),

  // The full picture the frontend's auth gate needs (App.tsx): a bare
  // session from createAnonymousSession alone answers neither question —
  // `hasLinkedIdentity: false` means "still needs Google," `hasProfile:
  // false` (with `hasLinkedIdentity: true`) means "Google done, still
  // needs RegisterPage.tsx." Only `hasLinkedIdentity && hasProfile` means
  // the operator's actual bar for using the platform is met — see
  // verificationService.ts.
  //
  // This runs on every page load (App.tsx's auth gate), so `hasProfile`
  // is answered via the KMS-free existence check, never by whether
  // `profile` below decrypted successfully — a Vault/KMS outage or
  // key-rotation hiccup must degrade PII display, not lock an already-
  // registered user out of the app. `profile` is still the real decrypted
  // data when available; on a KMS failure it's null (data temporarily
  // unavailable) while `hasProfile` stays true.
  myProfile: protectedProcedure.query(async ({ ctx }) => {
    const [hasLinkedIdentity, hasProfile, profile] = await Promise.all([
      hasLinkedIdentityForUser(ctx.appEnv.db, ctx.userId),
      userProfileExists(ctx.appEnv.db, ctx.userId),
      findUserProfileByUserId(ctx.appEnv.db, ctx.appEnv.vault, ctx.userId).catch((err) => {
        if (!(err instanceof KmsError)) throw err
        console.error('[AUTH] myProfile: failed to decrypt existing profile', err)
        return null
      }),
    ])

    return { hasLinkedIdentity, hasProfile, profile }
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
