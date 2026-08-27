import type { Database } from '@mincirklen/shared'
import type { Kysely } from 'kysely'
import { type KmsConfig, decryptField, encryptField } from '../adapters/kmsAdapter'

export interface UserProfileRow {
  id: string
  userId: string
  firstName: string
  lastName: string
  country: string
  mobileNumber: string
  stayAnonymous: boolean
  termsAcceptedAt: Date
  createdAt: Date
}

// The only shape ever encrypted/decrypted as a unit — see
// migrations/0006_encrypt_user_profile_pii.ts.
interface EncryptedPii {
  firstName: string
  lastName: string
  mobileNumber: string
}

// Upsert, not insert: resubmitting the registration form (retry after a
// dropped response, or coming back to edit before a dedicated settings UI
// exists) replaces the previous profile rather than erroring.
export async function upsertUserProfile(
  db: Kysely<Database>,
  kms: KmsConfig,
  params: {
    userId: string
    firstName: string
    lastName: string
    country: string
    mobileNumber: string
    stayAnonymous: boolean
    termsAcceptedAt: Date
  },
): Promise<UserProfileRow> {
  const pii: EncryptedPii = {
    firstName: params.firstName,
    lastName: params.lastName,
    mobileNumber: params.mobileNumber,
  }
  const piiCiphertext = await encryptField(kms, JSON.stringify(pii))

  const row = await db
    .insertInto('user_profiles')
    .values({
      user_id: params.userId,
      pii_ciphertext: piiCiphertext,
      country: params.country,
      stay_anonymous: params.stayAnonymous,
      terms_accepted_at: params.termsAcceptedAt,
    })
    .onConflict((oc) =>
      oc.column('user_id').doUpdateSet({
        pii_ciphertext: piiCiphertext,
        country: params.country,
        stay_anonymous: params.stayAnonymous,
        terms_accepted_at: params.termsAcceptedAt,
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow()

  // The plaintext is already on hand from `params` — no need to decrypt
  // what was just encrypted.
  return {
    id: row.id,
    userId: row.user_id,
    firstName: params.firstName,
    lastName: params.lastName,
    mobileNumber: params.mobileNumber,
    country: row.country,
    stayAnonymous: row.stay_anonymous,
    termsAcceptedAt: row.terms_accepted_at,
    createdAt: row.created_at,
  }
}

// Existence-only, no KMS/decrypt involved — for callers that only need to
// know "has this user completed registration" (login routing, the
// verifiedProcedure gate) and never touch the PII itself. Keeping these
// off the decrypt path means a KMS/Vault outage or key-rotation hiccup
// can degrade profile *display* without also breaking login and every
// gated feature — see findUserProfileByUserId for the one place that
// still needs the real, decrypted data.
export async function userProfileExists(db: Kysely<Database>, userId: string): Promise<boolean> {
  const row = await db.selectFrom('user_profiles').select('id').where('user_id', '=', userId).executeTakeFirst()
  return row !== undefined
}

export async function findUserProfileByUserId(
  db: Kysely<Database>,
  kms: KmsConfig,
  userId: string,
): Promise<UserProfileRow | null> {
  const row = await db.selectFrom('user_profiles').selectAll().where('user_id', '=', userId).executeTakeFirst()
  if (!row) return null

  const pii = JSON.parse(await decryptField(kms, row.pii_ciphertext)) as EncryptedPii

  return {
    id: row.id,
    userId: row.user_id,
    firstName: pii.firstName,
    lastName: pii.lastName,
    mobileNumber: pii.mobileNumber,
    country: row.country,
    stayAnonymous: row.stay_anonymous,
    termsAcceptedAt: row.terms_accepted_at,
    createdAt: row.created_at,
  }
}
