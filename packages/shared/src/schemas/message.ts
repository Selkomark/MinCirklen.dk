import { z } from 'zod'

export const messageSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  body: z.string().min(1),
  type: z.enum(['user', 'system']),
  createdAt: z.coerce.date(),
})

export type Message = z.infer<typeof messageSchema>

// Unidirectional (no `direction`) — unlike listOpenSessionsInputSchema's
// bidirectional browse-list pagination, message history only ever needs
// "older than this cursor" (scrolling up); the newest end is never
// paginated, it arrives live over the WebSocket instead. Omitting the
// cursor entirely means "give me the latest page" — see
// messageRepository.ts's listMessages for how that's implemented as the
// same query as any other page, not a special case.
export const listMessagesInputSchema = z.object({
  sessionId: z.string().uuid(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(30),
})

export type ListMessagesInput = z.infer<typeof listMessagesInputSchema>
