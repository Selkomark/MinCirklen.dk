import { z } from 'zod'

export const messageSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  body: z.string().min(1),
  createdAt: z.coerce.date(),
})

export type Message = z.infer<typeof messageSchema>
