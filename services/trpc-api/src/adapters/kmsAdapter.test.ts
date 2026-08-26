import { afterEach, describe, expect, test } from 'bun:test'
import { KmsError, decryptField, encryptField } from './kmsAdapter'

const originalFetch = globalThis.fetch
const CONFIG = { vaultAddr: 'http://vault.invalid', vaultToken: 'test-token' }

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('KmsError', () => {
  test('is a real Error subclass', () => {
    const err = new KmsError('boom')
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('boom')
  })
})

describe('encryptField', () => {
  test('base64-encodes the plaintext and returns the ciphertext', async () => {
    let capturedBody: unknown
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string)
      return Response.json({ data: { ciphertext: 'vault:v1:abc' } })
    }) as unknown as typeof fetch

    await expect(encryptField(CONFIG, 'hello')).resolves.toBe('vault:v1:abc')
    expect(capturedBody).toEqual({ plaintext: Buffer.from('hello', 'utf8').toString('base64') })
  })

  test('throws when the response is not ok', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch
    await expect(encryptField(CONFIG, 'hello')).rejects.toThrow('status 503')
  })

  test('throws when the response has no data', async () => {
    globalThis.fetch = (async () => Response.json({})) as unknown as typeof fetch
    await expect(encryptField(CONFIG, 'hello')).rejects.toThrow('missing "data"')
  })

  test('throws when the response is missing ciphertext', async () => {
    globalThis.fetch = (async () => Response.json({ data: {} })) as unknown as typeof fetch
    await expect(encryptField(CONFIG, 'hello')).rejects.toThrow('missing ciphertext')
  })
})

describe('decryptField', () => {
  test('base64-decodes the returned plaintext', async () => {
    let capturedBody: unknown
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string)
      return Response.json({ data: { plaintext: Buffer.from('hello', 'utf8').toString('base64') } })
    }) as unknown as typeof fetch

    await expect(decryptField(CONFIG, 'vault:v1:abc')).resolves.toBe('hello')
    expect(capturedBody).toEqual({ ciphertext: 'vault:v1:abc' })
  })

  test('throws when the response is not ok', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 400 })) as unknown as typeof fetch
    await expect(decryptField(CONFIG, 'vault:v1:abc')).rejects.toThrow('status 400')
  })

  test('throws when the response is missing plaintext', async () => {
    globalThis.fetch = (async () => Response.json({ data: {} })) as unknown as typeof fetch
    await expect(decryptField(CONFIG, 'vault:v1:abc')).rejects.toThrow('missing plaintext')
  })
})
