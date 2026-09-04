import type { Database } from '@mincirklen/shared'
import type { Kysely } from 'kysely'

export interface DataExportRequestRow {
  id: string
  status: 'pending' | 'processing' | 'ready' | 'failed' | 'expired'
  storageKey: string | null
  requestedAt: Date
  completedAt: Date | null
  expiresAt: Date | null
}

function toRow(row: {
  id: string
  status: string
  storage_key: string | null
  requested_at: Date
  completed_at: Date | null
  expires_at: Date | null
}): DataExportRequestRow {
  return {
    id: row.id,
    status: row.status as DataExportRequestRow['status'],
    storageKey: row.storage_key,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
  }
}

// trpc-api's own two touchpoints with this table — insert (on request)
// and read-back (status polling). Every status transition past
// 'pending', and the actual object write to GCS, is owned entirely by
// the separate data-export-service Cloud Run worker (see
// services/dataExportRequestService.ts's doc comment) — this repository
// deliberately has no update function, since trpc-api never performs
// one.
export async function insertDataExportRequest(db: Kysely<Database>, userId: string): Promise<DataExportRequestRow> {
  const row = await db.insertInto('data_export_requests').values({ user_id: userId }).returningAll().executeTakeFirstOrThrow()
  return toRow(row)
}

// Scoped to the requesting user by construction (params.userId, not just
// the request id) — a user must never be able to poll or read the
// status/download link of someone else's export by guessing an id.
export async function findDataExportRequestsForUser(db: Kysely<Database>, userId: string): Promise<DataExportRequestRow[]> {
  const rows = await db
    .selectFrom('data_export_requests')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('requested_at', 'desc')
    .execute()

  return rows.map(toRow)
}
