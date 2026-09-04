// This service intentionally does almost nothing — it inserts a
// `pending` row and publishes a Pub/Sub message, then returns
// immediately. The actual aggregation (profile, messages, moderation
// history, etc.), the GCS write, and the ready/failed status transition
// are all owned by the separate data-export-service Cloud Run worker,
// deliberately kept out of this process. That split is the whole point:
// a bug in export-generation code (an OOM on a large account, a bad
// query, an infinite loop) can only take down that one standalone
// worker, never trpc-api or anything else on the platform — trpc-api
// never calls into it synchronously for anything.
export interface DataExportRequestSummary {
  id: string
  status: 'pending' | 'processing' | 'ready' | 'failed' | 'expired'
  downloadUrl: string | null
  requestedAt: Date
  expiresAt: Date | null
}

export interface RequestDataExportDeps {
  insertRequest: () => Promise<{ id: string }>
  publish: (requestId: string) => Promise<void>
}

export async function requestDataExport(deps: RequestDataExportDeps): Promise<{ id: string }> {
  const request = await deps.insertRequest()
  await deps.publish(request.id)
  return request
}

export interface GetDataExportStatusDeps {
  findRequests: () => Promise<
    { id: string; status: DataExportRequestSummary['status']; storageKey: string | null; requestedAt: Date; expiresAt: Date | null }[]
  >
}

// `storageKey` holds the complete signed GCS download URL once the
// worker marks a request 'ready' (generated once, at completion time,
// by the worker — which already needs GCS/signing access for the
// upload itself) rather than a bare object path trpc-api would need its
// own GCS credentials to turn into a URL. That's deliberate: trpc-api
// never needs any GCS access at all under this design.
export async function getDataExportStatus(deps: GetDataExportStatusDeps): Promise<DataExportRequestSummary[]> {
  const requests = await deps.findRequests()

  return requests.map((r) => ({
    id: r.id,
    status: r.status,
    downloadUrl: r.status === 'ready' ? r.storageKey : null,
    requestedAt: r.requestedAt,
    expiresAt: r.expiresAt,
  }))
}
