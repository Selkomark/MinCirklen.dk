import type { Classification, Database } from '@mincirklen/shared'
import type { Kysely } from 'kysely'

export async function insertModerationEvent(
  db: Kysely<Database>,
  params: {
    sessionId: string
    userId: string
    messageId: string | null
    classification: Classification
  },
): Promise<void> {
  await db
    .insertInto('moderation_events')
    .values({
      session_id: params.sessionId,
      user_id: params.userId,
      message_id: params.messageId,
      classification: params.classification,
    })
    .execute()
}
