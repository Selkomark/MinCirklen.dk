import { Kysely } from 'kysely'

// Lets a circle's creator personalize it beyond the generic "<Topic>
// circle" label that used to be computed client-side (StartNewPage.tsx /
// StartJoinPage.tsx). Nullable for the same backward-compatibility reason
// as the scheduling columns added in 0007 — the pre-existing ad-hoc
// turn-based flow never sets it. The scheduled-circle create path
// (session.create with topicId/scheduledAt/capacity) requires it via
// createSessionInputSchema, so every row that has a topic_id also has a
// name — see sessionRepository.ts's listOpenSessions.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('sessions').addColumn('name', 'text').execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('sessions').dropColumn('name').execute()
}
