import { Storage } from '@google-cloud/storage'

// Uses the official SDK, unlike kmsAdapter.ts's (trpc-api) raw-fetch
// convention — same reasoning as pubsubPushAdapter.ts: V4 signed-URL
// generation on Cloud Run (no local private key, signing goes through
// the IAM signBlob API under the attached service account) is fiddly
// and security-relevant to get exactly right by hand, so it uses the
// SDK Google itself documents for this. Once depending on it for
// signing anyway, using it for the upload too keeps this file simple
// rather than mixing a raw-fetch upload with SDK-based signing.
export class GcsError extends Error {
  constructor(message: string) {
    super(message)
  }
}

// 'emulator' points at a local fake-gcs-server (docker-compose.yml's
// `gcs` service) for dev — signed URLs there are just plain links back
// to the emulator's own HTTP endpoint, since there's no real auth to
// sign against locally and nothing security-sensitive about a
// throwaway dev bucket. 'gcp' is the real thing in production, using
// the attached service account's identity via ADC (Application Default
// Credentials) — no key file, no explicit service account email needed
// in code, the SDK resolves both from the Cloud Run metadata server.
export type GcsConfig =
  | { provider: 'emulator'; apiEndpoint: string; bucket: string }
  | { provider: 'gcp'; bucket: string }

function storageClientFor(config: GcsConfig): Storage {
  if (config.provider === 'emulator') {
    return new Storage({ apiEndpoint: config.apiEndpoint, projectId: 'mincirklen-local' })
  }
  return new Storage()
}

export async function uploadExportObject(config: GcsConfig, objectKey: string, jsonBody: string): Promise<void> {
  const storage = storageClientFor(config)
  const bucket = storage.bucket(config.bucket)

  try {
    await bucket.file(objectKey).save(jsonBody, { contentType: 'application/json', resumable: false })
  } catch (err) {
    throw new GcsError(`failed to upload export object "${objectKey}": ${err instanceof Error ? err.message : String(err)}`)
  }
}

// `expiresAt` is the same value written to data_export_requests.expires_at
// — one TTL, one source of truth (see services/exportGenerationService.ts).
export async function generateExportDownloadUrl(config: GcsConfig, objectKey: string, expiresAt: Date): Promise<string> {
  if (config.provider === 'emulator') {
    // No real signing locally — a plain link to the emulator's own
    // public read endpoint is sufficient for dev, and the emulator has
    // no auth to sign against in the first place.
    return `${config.apiEndpoint}/storage/v1/b/${config.bucket}/o/${encodeURIComponent(objectKey)}?alt=media`
  }

  const storage = storageClientFor(config)
  const bucket = storage.bucket(config.bucket)

  try {
    const [url] = await bucket.file(objectKey).getSignedUrl({ action: 'read', expires: expiresAt })
    return url
  } catch (err) {
    throw new GcsError(`failed to sign a download url for "${objectKey}": ${err instanceof Error ? err.message : String(err)}`)
  }
}
