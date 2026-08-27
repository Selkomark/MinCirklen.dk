import { Kysely, sql } from 'kysely'

// Backs server-side search on /start/join (sessionRepository.ts's
// listOpenSessions): pg_trgm's GIN index accelerates ILIKE '%term%'
// substring scans at scale and adds a `similarity()` function used for
// typo-tolerant fuzzy matching — see the plan discussion on why trigram
// was chosen over plain ILIKE (no new infra) and over embeddings (every
// match still shares literal characters with the query, which is what
// makes highlighting the matched substring in the UI possible at all).
//
// Explicitly installed into `public` (with the operator class
// schema-qualified below), not left to land in whichever schema happens
// to be on `search_path` when this first runs: `createPgPool` sets
// `search_path` to exactly one schema (`dev` or `test`, never both —
// see docs/local_dev.md), but a Postgres extension is a database-wide
// singleton — whichever schema runs this migration first "claims" it,
// leaving the other schema's search_path unable to resolve
// `gin_trgm_ops` at all. `public` is neutral ground both schemas can
// reference explicitly regardless of which one migrates first.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create extension if not exists pg_trgm with schema public`.execute(db)
  await sql`create index sessions_name_trgm_idx on sessions using gin (name public.gin_trgm_ops)`.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop index if exists sessions_name_trgm_idx`.execute(db)
  await sql`drop extension if exists pg_trgm`.execute(db)
}
