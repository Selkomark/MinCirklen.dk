import type { Database } from '@mincirklen/shared'
import type { Kysely } from 'kysely'
import type { GcsConfig } from './adapters/gcsAdapter'
import type { KmsConfig } from './adapters/kmsAdapter'
import type { PushAuthConfig } from './adapters/pubsubPushAdapter'

export interface AppEnv {
  db: Kysely<Database>
  gcs: GcsConfig
  pushAuth: PushAuthConfig
  // Decrypt-only — see adapters/kmsAdapter.ts's doc comment for why this
  // is a separate copy from trpc-api's own.
  kms: KmsConfig
  // How long a completed export's download link stays valid — also
  // written to data_export_requests.expires_at, and mirrored by the GCS
  // bucket's own lifecycle rule (defense in depth, independent of this
  // app-level TTL) — see docs/gdpr-runbook.md and the bucket's Terraform
  // config for the lifecycle rule itself.
  downloadTtlMs: number
}
