import { describe, expect, test } from 'bun:test'
import { getDataExportStatus, requestDataExport } from './dataExportRequestService'

describe('requestDataExport', () => {
  test('inserts a request row and publishes with its id', async () => {
    const published: { requestId: string | null } = { requestId: null }

    const result = await requestDataExport({
      insertRequest: async () => ({ id: 'req-1' }),
      publish: async (requestId) => {
        published.requestId = requestId
      },
    })

    expect(result).toEqual({ id: 'req-1' })
    expect(published.requestId).toBe('req-1')
  })
})

describe('getDataExportStatus', () => {
  test('exposes a download url only for a ready request', async () => {
    const result = await getDataExportStatus({
      findRequests: async () => [
        {
          id: 'req-1',
          status: 'ready',
          storageKey: 'https://storage.googleapis.com/signed-url',
          requestedAt: new Date('2026-01-01T00:00:00Z'),
          expiresAt: new Date('2026-01-03T00:00:00Z'),
        },
        {
          id: 'req-2',
          status: 'pending',
          storageKey: null,
          requestedAt: new Date('2026-01-02T00:00:00Z'),
          expiresAt: null,
        },
      ],
    })

    expect(result).toEqual([
      {
        id: 'req-1',
        status: 'ready',
        downloadUrl: 'https://storage.googleapis.com/signed-url',
        requestedAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date('2026-01-03T00:00:00Z'),
      },
      {
        id: 'req-2',
        status: 'pending',
        downloadUrl: null,
        requestedAt: new Date('2026-01-02T00:00:00Z'),
        expiresAt: null,
      },
    ])
  })

  test('never exposes a stored storageKey as a download url for a non-ready status', async () => {
    const result = await getDataExportStatus({
      findRequests: async () => [
        {
          id: 'req-1',
          status: 'failed',
          // Defensive: even if a stale/leftover value were present, a
          // failed request must never hand back a download link.
          storageKey: 'https://storage.googleapis.com/stale-leftover',
          requestedAt: new Date('2026-01-01T00:00:00Z'),
          expiresAt: null,
        },
      ],
    })

    expect(result[0]?.downloadUrl).toBeNull()
  })
})
