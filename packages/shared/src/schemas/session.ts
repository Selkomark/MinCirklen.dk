import { z } from 'zod'

export const sessionStatusSchema = z.enum(['forming', 'active', 'completed', 'cancelled'])

export type SessionStatus = z.infer<typeof sessionStatusSchema>

export const sessionSchema = z.object({
  id: z.string().uuid(),
  status: sessionStatusSchema,
  createdAt: z.coerce.date(),
  startedAt: z.coerce.date().nullable(),
  endedAt: z.coerce.date().nullable(),
  // turnClaimedAt is deliberately not exposed here — internal concurrency
  // control, not client-facing.
  currentTurnUserId: z.string().uuid().nullable(),
})

export type Session = z.infer<typeof sessionSchema>
