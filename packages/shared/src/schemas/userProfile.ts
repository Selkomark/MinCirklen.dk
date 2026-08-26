import { z } from 'zod'

// Client-supplied fields from the post-login registration page
// (RegisterPage.tsx). `termsAcceptedAt` is deliberately not here — the
// server stamps it at submission time, it's never client-supplied.
export const createUserProfileInputSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  country: z.string().trim().length(2),
  mobileNumber: z.string().trim().min(1).max(32),
  stayAnonymous: z.boolean(),
})

export type CreateUserProfileInput = z.infer<typeof createUserProfileInputSchema>

export const userProfileSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  country: z.string(),
  mobileNumber: z.string(),
  stayAnonymous: z.boolean(),
  termsAcceptedAt: z.coerce.date(),
  createdAt: z.coerce.date(),
})

export type UserProfile = z.infer<typeof userProfileSchema>
