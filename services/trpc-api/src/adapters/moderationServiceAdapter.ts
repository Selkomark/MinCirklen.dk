import { classificationSchema, type Classification } from '@mincirklen/shared'

export async function checkModerationServiceHealth(baseUrl: string): Promise<void> {
  const res = await fetch(`${baseUrl}/health`)
  if (!res.ok) {
    throw new Error(`status ${res.status}`)
  }
}

// Explicit constructor: see the same note in repositories/sessionRepository.ts.
export class ModerationServiceError extends Error {
  constructor(message: string) {
    super(message)
  }
}

// Fail closed: a non-2xx status, a network failure, or a body that doesn't
// parse as a known Classification all throw rather than resolving to
// something that could be mistaken for a "pass" — the caller must treat a
// thrown error as blocking, never as an implicit pass-through.
export async function classifyMessage(
  baseUrl: string,
  params: { sessionId: string; message: string },
): Promise<Classification> {
  const res = await fetch(`${baseUrl}/classify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: params.sessionId, message: params.message }),
  })

  if (!res.ok) {
    throw new ModerationServiceError(`status ${res.status}`)
  }

  const body = await res.json().catch(() => null)
  const parsed = classificationSchema.safeParse((body as { result?: unknown } | null)?.result)

  if (!parsed.success) {
    throw new ModerationServiceError('moderation service returned an unrecognized classification')
  }

  return parsed.data
}
