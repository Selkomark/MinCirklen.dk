import { MAX_USERS_PER_SESSION, TURN_CLAIM_STALE_AFTER_SECONDS, isSessionMember, type Database, type Topic } from '@mincirklen/shared'
import { sql, type Kysely } from 'kysely'

export { isSessionMember }

// Explicit constructors here (rather than relying on the implicit default)
// so Bun's coverage instrumentation actually tracks these as invoked —
// an empty `class X extends Error {}` body otherwise counts as a
// permanently-uncovered function regardless of how many times `new X()`
// runs.
export class SessionNotFoundError extends Error {
  constructor(message: string) {
    super(message)
  }
}
export class SessionFullError extends Error {
  constructor(message: string) {
    super(message)
  }
}
export class NotYourTurnError extends Error {
  constructor(message: string) {
    super(message)
  }
}
export class TurnAlreadyClaimedError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export interface RosterEntry {
  userId: string
  turnOrder: number
}

export interface SessionState {
  id: string
  status: 'forming' | 'active' | 'completed' | 'cancelled'
  currentTurnUserId: string | null
  roster: RosterEntry[]
}

export interface CreateSessionParams {
  topicId: string
  name: string
  scheduledAt: Date | string
  durationMinutes: number | null
  capacity: number
}

// `params` is optional so the pre-existing ad-hoc turn-based flow (every
// call site before the scheduled /start/new flow existed) keeps working
// unchanged — see migrations/0007_circle_scheduling.ts and
// migrations/0008_circle_name.ts.
export async function createSession(db: Kysely<Database>, params?: CreateSessionParams): Promise<{ id: string }> {
  const row = params
    ? await db
        .insertInto('sessions')
        .values({
          status: 'forming',
          topic_id: params.topicId,
          name: params.name,
          scheduled_at: params.scheduledAt,
          duration_minutes: params.durationMinutes,
          capacity: params.capacity,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
    : await db.insertInto('sessions').defaultValues().returningAll().executeTakeFirstOrThrow()
  return { id: row.id }
}

export interface OpenSession {
  id: string
  status: 'forming' | 'active' | 'completed' | 'cancelled'
  // Nullable despite session.create now requiring it for every new
  // scheduled circle: a row created between migration 0007 (topic_id)
  // and 0008 (name) legitimately has a topic but no name. Callers must
  // handle null rather than assume the input-schema requirement was
  // always in force.
  name: string | null
  scheduledAt: Date
  durationMinutes: number | null
  capacity: number
  joinedCount: number
  topic: Topic
}

export interface ListOpenSessionsFilters {
  search?: string
  topicId?: string
  capacity?: number
  // undefined = any duration, null = open-ended circles only, a number =
  // that exact duration.
  durationMinutes?: number | null
  date?: string // 'YYYY-MM-DD'
  cursor?: string
  // Which side of `cursor` to fetch. Ignored (treated as 'after') when
  // there's no cursor — the very first fetch has no "before" side.
  direction?: 'after' | 'before'
  limit: number
}

export interface ListOpenSessionsResult {
  sessions: OpenSession[]
  nextCursor: string | null
  prevCursor: string | null
}

// Display name used for both search matching and the "no name yet"
// fallback — kept identical to shared.tsx's displayName() so a search
// term matches exactly what the user sees rendered.
const DISPLAY_NAME_SQL = sql<string>`coalesce(s.name, t.label || ' circle')`

function parseCursor(cursor: string): { mode: 'schedule' | 'relevance'; value: string; id: string } {
  const [mode, value, id] = cursor.split('|')
  if ((mode !== 'schedule' && mode !== 'relevance') || value === undefined || !id) {
    throw new Error(`invalid cursor: ${cursor}`)
  }
  return { mode, value, id }
}

// Circles browsable on /start/join: scheduled (has a topic), still
// forming or active, and not yet full. Ad-hoc turn-based sessions (no
// topic) never appear here.
//
// Two-level query: the inner query aggregates membership counts (and, if
// searching, a trigram relevance score) per session; the outer query
// filters out full circles via `whereRef` (a plain column-to-column
// comparison on the now-materialized `joined_count`/`capacity` columns,
// rather than a `HAVING` on the raw aggregate) and applies keyset-cursor
// pagination. Filtering/pagination all happen in SQL — this must never
// go back to fetching everything and filtering in JS, which breaks
// pagination (a page could come back short, or with the wrong rows,
// once full circles are excluded afterward) and doesn't scale.
//
// Bidirectional: `direction: 'before'` fetches the page immediately
// preceding the cursor instead of following it — this backs the windowed
// browse list on /start/join (pages/start/shared.tsx), which evicts
// whichever end the user has scrolled away from and re-fetches from here
// (not from a client cache) if they scroll back. The row order returned
// is always the same canonical order regardless of direction — a
// `before` fetch queries in the *reverse* of that order (so `LIMIT`
// grabs the rows closest to the cursor, not the ones closest to the true
// end of the whole list) and reverses the JS result back afterward.
// Callers never need to reason about which direction produced a page.
//
// Schedule mode's canonical order is descending by scheduled_at — newest/
// soonest-starting circle first, oldest last. This makes the browse list
// read like a normal feed: 'after' (the bottom sentinel, "load more")
// moves further into the past, 'before' (the top sentinel) moves toward
// the future. The frontend's very first fetch synthesizes a schedule
// cursor for "now" (see fetchOpenSessionsPage in shared.tsx) rather than
// passing no cursor at all, so the initial view is anchored at the
// present instead of at the single furthest-future circle in the whole
// dataset. Relevance mode (search active) is unaffected — best-match
// first stays the ordering there, since "recency" isn't a meaningful
// concept once you're searching by name.
export async function listOpenSessions(db: Kysely<Database>, filters: ListOpenSessionsFilters): Promise<ListOpenSessionsResult> {
  const searchTerm = filters.search?.trim()
  const relevanceMode = !!searchTerm
  // No cursor means "the very first page" — direction is meaningless
  // there (nothing precedes the start of the list).
  const isBefore = !!filters.cursor && filters.direction === 'before'

  // Selected in the same array as everything else (rather than via a
  // separate later `.select()` call) with the same declared type in both
  // branches (`number | null`) — Kysely infers the derived table's
  // column set from this one call, so branching on which columns get
  // selected (rather than only on which raw SQL expression fills this
  // one) would make `inner`'s type unstable across the two code paths.
  const relevanceExpr = relevanceMode
    ? sql<number | null>`public.similarity(${DISPLAY_NAME_SQL}, ${searchTerm})`
    : sql<number | null>`null`

  let inner = db
    .selectFrom('sessions as s')
    .innerJoin('topics as t', 't.id', 's.topic_id')
    .leftJoin('session_users as su', 'su.session_id', 's.id')
    .select(({ fn }) => [
      's.id as id',
      's.status as status',
      's.name as name',
      's.scheduled_at as scheduled_at',
      's.duration_minutes as duration_minutes',
      's.capacity as capacity',
      't.id as topic_id',
      't.slug as topic_slug',
      't.label as topic_label',
      fn.count<string>('su.user_id').as('joined_count'),
      relevanceExpr.as('relevance'),
      // A second, raw-text form of the same column, used only for the
      // cursor. `scheduled_at` comes back from `pg` as a JS `Date`, which
      // only has millisecond resolution — Postgres's timestamptz has
      // microsecond resolution. Round-tripping the cursor through
      // `Date#toISOString()` truncates that, so a boundary row's precise
      // value (e.g. .123456) no longer equals the truncated cursor
      // (.123000), the row satisfies `> cursor` again on the next page,
      // and gets returned twice. Postgres's own text representation
      // round-trips through `::timestamptz` exactly, with no such loss.
      sql<string>`s.scheduled_at::text`.as('scheduled_at_cursor'),
    ])
    .where('s.status', 'in', ['forming', 'active'])

  if (filters.topicId) {
    inner = inner.where('s.topic_id', '=', filters.topicId)
  }
  if (filters.capacity !== undefined) {
    inner = inner.where('s.capacity', '=', filters.capacity)
  }
  if (filters.durationMinutes !== undefined) {
    inner =
      filters.durationMinutes === null
        ? inner.where('s.duration_minutes', 'is', null)
        : inner.where('s.duration_minutes', '=', filters.durationMinutes)
  }
  if (filters.date) {
    inner = inner.where(sql<boolean>`date_trunc('day', s.scheduled_at)::date = ${filters.date}::date`)
  }

  if (relevanceMode) {
    inner = inner.where(
      sql<boolean>`(${DISPLAY_NAME_SQL} ilike ${'%' + searchTerm + '%'} or public.similarity(${DISPLAY_NAME_SQL}, ${searchTerm}) > 0.3)`,
    )
  }

  const aggregated = inner.groupBy(['s.id', 't.id']).as('agg')

  let outer = db.selectFrom(aggregated).selectAll().whereRef('agg.joined_count', '<', 'agg.capacity')

  if (filters.cursor) {
    const decoded = parseCursor(filters.cursor)
    if (relevanceMode && decoded.mode === 'relevance') {
      const score = Number(decoded.value)
      outer = isBefore
        ? outer.where((eb) =>
            eb.or([eb('agg.relevance', '>', score), eb.and([eb('agg.relevance', '=', score), eb('agg.id', '<', decoded.id)])]),
          )
        : outer.where((eb) =>
            eb.or([eb('agg.relevance', '<', score), eb.and([eb('agg.relevance', '=', score), eb('agg.id', '>', decoded.id)])]),
          )
    } else if (!relevanceMode && decoded.mode === 'schedule') {
      // Compared as text cast back to timestamptz, not as a JS Date — see
      // the comment on `scheduled_at_cursor` above for why.
      //
      // Schedule mode's canonical order is descending (newest/soonest
      // first, oldest last) — see the function doc comment — so
      // 'after' (continuing down, toward the past) means *smaller*
      // values here, and 'before' (continuing up, toward the future)
      // means *larger* ones. This is the inverse of relevance mode's
      // comparisons just above, which stay ascending-canonical.
      outer = isBefore
        ? outer.where(
            sql<boolean>`(agg.scheduled_at > ${decoded.value}::timestamptz) or (agg.scheduled_at = ${decoded.value}::timestamptz and agg.id > ${decoded.id})`,
          )
        : outer.where(
            sql<boolean>`(agg.scheduled_at < ${decoded.value}::timestamptz) or (agg.scheduled_at = ${decoded.value}::timestamptz and agg.id < ${decoded.id})`,
          )
    }
    // A cursor from the "other" mode means search/filters changed
    // between pages — the frontend always resets the cursor when that
    // happens, so this branch only matters defensively.
  }

  if (relevanceMode) {
    outer = isBefore
      ? outer.orderBy('agg.relevance', 'asc').orderBy('agg.id', 'desc')
      : outer.orderBy('agg.relevance', 'desc').orderBy('agg.id', 'asc')
  } else {
    // Newest/soonest-scheduled first, descending — see the function doc
    // comment for why the browse list reads this way (top = "now",
    // scrolling down goes further into the past).
    outer = isBefore
      ? outer.orderBy('agg.scheduled_at', 'asc').orderBy('agg.id', 'asc')
      : outer.orderBy('agg.scheduled_at', 'desc').orderBy('agg.id', 'desc')
  }

  const rows = await outer.limit(filters.limit + 1).execute()
  const hasExtra = rows.length > filters.limit
  const trimmed = rows.slice(0, filters.limit)
  // A `before` fetch queried in reverse (closest-to-cursor first) so
  // `LIMIT` would grab the right rows — flip back to canonical ascending
  // order before this page is used for anything else.
  const page = isBefore ? trimmed.reverse() : trimmed

  const first = page[0]
  const last = page[page.length - 1]
  const encode = (row: NonNullable<typeof first>) =>
    relevanceMode ? `relevance|${row.relevance}|${row.id}` : `schedule|${row.scheduled_at_cursor}|${row.id}`

  // No cursor (first page ever): nothing precedes it, "more after" iff
  // the over-fetch found an extra row.
  // Forward from a cursor: there's always something before (the pages
  // already seen); "more after" iff the over-fetch found an extra row.
  // Backward from a cursor: there's always something after (the point we
  // paged back from); "more before" iff the (reversed) over-fetch found
  // an extra row further back.
  const hasPrevious = !filters.cursor ? false : isBefore ? hasExtra : true
  const hasNext = !filters.cursor ? hasExtra : isBefore ? true : hasExtra

  return {
    sessions: page.map((row) => ({
      id: row.id,
      status: row.status,
      name: row.name,
      scheduledAt: row.scheduled_at as Date,
      durationMinutes: row.duration_minutes,
      capacity: row.capacity as number,
      joinedCount: Number(row.joined_count),
      topic: { id: row.topic_id, slug: row.topic_slug, label: row.topic_label },
    })),
    nextCursor: hasNext && last ? encode(last) : null,
    prevCursor: hasPrevious && first ? encode(first) : null,
  }
}

export async function getRoster(db: Kysely<Database>, sessionId: string): Promise<RosterEntry[]> {
  const rows = await db
    .selectFrom('session_users')
    .select(['user_id', 'turn_order'])
    .where('session_id', '=', sessionId)
    .orderBy('turn_order', 'asc')
    .execute()

  return rows
    .filter((row) => row.turn_order !== null)
    .map((row) => ({ userId: row.user_id, turnOrder: row.turn_order as number }))
}

export async function getSessionState(db: Kysely<Database>, sessionId: string): Promise<SessionState | null> {
  const session = await db
    .selectFrom('sessions')
    .select(['id', 'status', 'current_turn_user_id'])
    .where('id', '=', sessionId)
    .executeTakeFirst()

  if (!session) return null

  const roster = await getRoster(db, sessionId)

  return {
    id: session.id,
    status: session.status,
    currentTurnUserId: session.current_turn_user_id,
    roster,
  }
}

export async function joinSession(
  db: Kysely<Database>,
  sessionId: string,
  userId: string,
): Promise<RosterEntry> {
  return db.transaction().execute(async (trx) => {
    const session = await trx
      .selectFrom('sessions')
      .select(['id', 'capacity'])
      .where('id', '=', sessionId)
      .forUpdate()
      .executeTakeFirst()

    if (!session) {
      throw new SessionNotFoundError(`session ${sessionId} not found`)
    }

    const roster = await getRoster(trx, sessionId)
    const existing = roster.find((entry) => entry.userId === userId)
    if (existing) {
      return existing
    }

    const capacity = session.capacity ?? MAX_USERS_PER_SESSION
    if (roster.length >= capacity) {
      throw new SessionFullError(`session ${sessionId} is full`)
    }

    const turnOrder = roster.length

    await trx
      .insertInto('session_users')
      .values({ session_id: sessionId, user_id: userId, turn_order: turnOrder })
      .execute()

    if (turnOrder === 0) {
      await trx
        .updateTable('sessions')
        .set({ status: 'active', current_turn_user_id: userId })
        .where('id', '=', sessionId)
        .execute()
    }

    // TODO: publish a joinedCount-changed event for this sessionId here
    // (and the symmetric case wherever a member leaves/disconnects) —
    // via Redis (see redisAdapter.ts), not NATS. NATS in this codebase
    // is specifically websocket-service's horizontal-fanout transport
    // for relaying chat messages between instances; active-participant
    // counts are a different concern and fit Redis better (e.g. a
    // per-session counter key, or pub/sub if websocket-service instances
    // need to react to the change directly). That's the other half of
    // what lets /start/join show live open-spot counts — see the TODO in
    // StartJoinPage.tsx next to joinedCount.

    return { userId, turnOrder }
  })
}

export async function claimTurn(db: Kysely<Database>, sessionId: string, userId: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const session = await trx
      .selectFrom('sessions')
      .select(['current_turn_user_id', 'turn_claimed_at'])
      .where('id', '=', sessionId)
      .forUpdate()
      .executeTakeFirst()

    if (!session) {
      throw new SessionNotFoundError(`session ${sessionId} not found`)
    }

    if (session.current_turn_user_id !== userId) {
      throw new NotYourTurnError(`user ${userId} does not hold the turn for session ${sessionId}`)
    }

    if (session.turn_claimed_at) {
      const ageSeconds = (Date.now() - session.turn_claimed_at.getTime()) / 1000
      if (ageSeconds < TURN_CLAIM_STALE_AFTER_SECONDS) {
        throw new TurnAlreadyClaimedError(`turn for session ${sessionId} is already claimed`)
      }
    }

    await trx.updateTable('sessions').set({ turn_claimed_at: new Date() }).where('id', '=', sessionId).execute()
  })
}

export async function releaseTurnClaim(db: Kysely<Database>, sessionId: string): Promise<void> {
  await db.updateTable('sessions').set({ turn_claimed_at: null }).where('id', '=', sessionId).execute()
}

export async function advanceTurn(db: Kysely<Database>, sessionId: string): Promise<void> {
  const roster = await getRoster(db, sessionId)
  if (roster.length === 0) return

  const session = await db
    .selectFrom('sessions')
    .select('current_turn_user_id')
    .where('id', '=', sessionId)
    .executeTakeFirst()

  const currentIndex = roster.findIndex((entry) => entry.userId === session?.current_turn_user_id)
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % roster.length
  const next = roster[nextIndex]

  await db
    .updateTable('sessions')
    .set({ current_turn_user_id: next?.userId ?? null, turn_claimed_at: null })
    .where('id', '=', sessionId)
    .execute()
}
