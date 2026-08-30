import { z } from 'zod'

// The platform's supported UI languages (see services/web-app/src/i18n.ts).
// `nb` (Norwegian Bokmål) rather than a bare `no`, matching the IETF/BCP-47
// tag i18next and react-aria-components both expect.
export const SUPPORTED_LANGUAGES = ['en', 'sv', 'da', 'nb', 'fi'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

// Intl.supportedValuesOf('timeZone') is the runtime-authoritative IANA zone
// list (Node/Bun both implement it) — validating against it here means a
// bad zone name can never reach the DB, with no hand-maintained zone list.
const isValidTimeZone = (tz: string): boolean => Intl.supportedValuesOf('timeZone').includes(tz)

// Client-supplied fields from the post-login registration page
// (RegisterPage.tsx) — also reused as the edit path from the Account
// modal's Profile/Preferences sections. `termsAcceptedAt` is deliberately
// not here — the server stamps it at submission time, it's never
// client-supplied. `language`/`timezone` are nullable, not just optional:
// `null` is a real, meaningful choice ("use detected language," "use
// system timezone"), distinct from "field omitted."
export const createUserProfileInputSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  country: z.string().trim().length(2),
  mobileNumber: z.string().trim().min(1).max(32),
  stayAnonymous: z.boolean(),
  language: z.enum(SUPPORTED_LANGUAGES).nullable().optional(),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(isValidTimeZone, 'Invalid IANA timezone')
    .nullable()
    .optional(),
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
  language: z.string().nullable(),
  timezone: z.string().nullable(),
})

export type UserProfile = z.infer<typeof userProfileSchema>
