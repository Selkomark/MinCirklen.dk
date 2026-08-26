import { Pool } from 'pg'

// `schema` is required, not defaulted to `public` — every caller has to
// consciously pick `dev` or `test` (never `public`, see docs/local_dev.md).
// Set as a connection-level `search_path` rather than baked into
// `connectionString` so every unqualified table reference — including
// Kysely's own migration bookkeeping tables — resolves into it.
export function createPgPool(connectionString: string, schema: string): Pool {
  return new Pool({ connectionString, options: `-c search_path=${schema}` })
}
