// Encryption-as-a-service client — HashiCorp Vault's Transit engine
// locally (docker-compose's `vault` service), a real cloud KMS (e.g. GCP
// Cloud KMS) in production. Neither this adapter's callers nor its own
// interface below are Vault-specific: swapping the implementation for a
// cloud KMS client only touches this file.
export class KmsError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export interface KmsConfig {
  vaultAddr: string
  vaultToken: string
}

// Fixed, not configurable per environment — this is the one Transit key
// this service ever uses (see docker-compose.yml's `vault-init`), not a
// deployment-varying value.
const TRANSIT_KEY_NAME = 'user-profile-pii'

async function vaultRequest(config: KmsConfig, path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${config.vaultAddr}/v1/${path}`, {
    method: 'POST',
    headers: { 'X-Vault-Token': config.vaultToken, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new KmsError(`vault request to ${path} failed: status ${res.status}`)
  }

  const parsed = (await res.json()) as { data?: Record<string, unknown> }
  if (!parsed.data) {
    throw new KmsError(`vault response from ${path} is missing "data"`)
  }

  return parsed.data
}

export async function encryptField(config: KmsConfig, plaintext: string): Promise<string> {
  const data = await vaultRequest(config, `transit/encrypt/${TRANSIT_KEY_NAME}`, {
    plaintext: Buffer.from(plaintext, 'utf8').toString('base64'),
  })

  const ciphertext = data.ciphertext
  if (typeof ciphertext !== 'string') {
    throw new KmsError('vault encrypt response missing ciphertext')
  }

  return ciphertext
}

export async function decryptField(config: KmsConfig, ciphertext: string): Promise<string> {
  const data = await vaultRequest(config, `transit/decrypt/${TRANSIT_KEY_NAME}`, { ciphertext })

  const plaintextB64 = data.plaintext
  if (typeof plaintextB64 !== 'string') {
    throw new KmsError('vault decrypt response missing plaintext')
  }

  return Buffer.from(plaintextB64, 'base64').toString('utf8')
}
