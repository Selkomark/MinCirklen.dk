import { Kysely, sql } from 'kysely'

// Single consolidated migration — this repo hasn't launched yet, so
// there's no production data whose migration history needs preserving.
// Previously 16 incremental files (participants -> users rename, PII
// encryption, circle scheduling, message types, etc.); squashed into one
// once since the schema settled, rather than carrying that history
// forward indefinitely. If you're adding a new column/table, just add it
// here directly — there's no reason to start a new incremental file
// again unless/until this has real user data to preserve.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create extension if not exists pg_trgm with schema public`.execute(db)

  await db.schema
    .createTable('users')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('last_seen_at', 'timestamptz')
    .execute()

  await db.schema
    .createTable('user_identities')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('provider', 'text', (col) => col.notNull())
    .addColumn('provider_subject_hash', 'text', (col) => col.notNull())
    .addColumn('linked_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('user_identities_provider_subject_unique')
    .on('user_identities')
    .columns(['provider', 'provider_subject_hash'])
    .unique()
    .execute()

  // Opt-in identity info collected by the post-login registration page
  // (RegisterPage.tsx) — kept in its own table rather than on `users`
  // because anonymity is the default (Charter §4), not a property of
  // every account. first_name/last_name/mobile_number are genuinely
  // identifying PII, so they're never stored as plaintext columns —
  // only as `pii_ciphertext`, encrypted application-side (see
  // services/trpc-api/src/adapters/kmsAdapter.ts, via Vault's Transit
  // engine locally / a cloud KMS in prod) before it ever reaches
  // Postgres. gender/country/stay_anonymous stay plaintext — low
  // sensitivity on their own, and useful for aggregate reporting.
  await db.schema
    .createTable('user_profiles')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().unique().references('users.id').onDelete('cascade'))
    .addColumn('pii_ciphertext', 'text', (col) => col.notNull())
    .addColumn('gender', 'text', (col) => col.notNull())
    .addColumn('country', 'text', (col) => col.notNull())
    .addColumn('stay_anonymous', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('terms_accepted_at', 'timestamptz', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    // Nullable — null is a meaningful value, not just "unset": for
    // `language` it means "fall back to detected/browser language," for
    // `timezone` it means "use the system/browser timezone" rather than
    // a specific stored one.
    .addColumn('language', 'text')
    .addColumn('timezone', 'text')
    .execute()

  await db.schema
    .createTable('topics')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('slug', 'text', (col) => col.notNull().unique())
    .addColumn('label', 'text', (col) => col.notNull())
    .addColumn('sort_order', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('is_active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db
    .insertInto('topics')
    .values([
      { slug: 'grief', label: 'Grief', sort_order: 0 },
      { slug: 'anxiety', label: 'Anxiety', sort_order: 1 },
      { slug: 'parenting', label: 'New parents', sort_order: 2 },
      { slug: 'chronic', label: 'Chronic illness', sort_order: 3 },
      { slug: 'career', label: 'Career transitions', sort_order: 4 },
      { slug: 'sleep', label: 'Sleep and insomnia', sort_order: 5 },
    ])
    .onConflict((oc) => oc.column('slug').doNothing())
    .execute()

  await db.schema
    .createTable('sessions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('forming'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('started_at', 'timestamptz')
    .addColumn('ended_at', 'timestamptz')
    .addColumn('current_turn_user_id', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('turn_claimed_at', 'timestamptz')
    // Nullable: the ad-hoc turn-based flow (createSession(db) with no
    // scheduling info — tests, packages/shared/src/db/seed.ts) never
    // sets these. Only the scheduled-circle create path
    // (session.create with topicId/scheduledAt/capacity) populates
    // them — see services/trpc-api/src/repositories/sessionRepository.ts.
    .addColumn('topic_id', 'uuid', (col) => col.references('topics.id'))
    .addColumn('scheduled_at', 'timestamptz')
    .addColumn('duration_minutes', 'integer')
    .addColumn('capacity', 'integer')
    // Lets a circle's creator personalize it beyond the generic
    // "<Topic> circle" label. Every row with a topic_id also has a
    // name — createSessionInputSchema requires it for that path — see
    // sessionRepository.ts's listOpenSessions.
    .addColumn('name', 'text')
    .addCheckConstraint('sessions_status_check', sql`status in ('forming','active','completed','cancelled')`)
    .execute()

  // Backs server-side search on /start/join (sessionRepository.ts's
  // listOpenSessions): pg_trgm's GIN index accelerates ILIKE '%term%'
  // substring scans at scale and adds a `similarity()` function used
  // for typo-tolerant fuzzy matching. Schema-qualified (public) since
  // the extension itself is a database-wide singleton, not scoped to
  // whichever of dev/test happens to run this migration first.
  await sql`create index sessions_name_trgm_idx on sessions using gin (name public.gin_trgm_ops)`.execute(db)

  await db.schema
    .createTable('session_users')
    .addColumn('session_id', 'uuid', (col) => col.notNull().references('sessions.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('joined_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('left_at', 'timestamptz')
    .addColumn('turn_order', 'integer')
    // Bumped on every visit to /s/:sessionId, not just the original
    // join — backs the "recent sessions" sidebar ordering (most
    // recently visited first). Revisiting an already-joined session
    // bumps it back to the top; the original join still only happens
    // once.
    .addColumn('last_visited_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    // Per-membership community-guidelines consent record — { key:
    // ISO8601 timestamp } — one row per (user, session) joined, so
    // every circle join has its own auditable consent record. A
    // returning user who already agreed on some other session isn't
    // asked again — see sessionRepository.ts's copyPriorAgreementIfAny.
    .addColumn('agreements', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addPrimaryKeyConstraint('session_users_pk', ['session_id', 'user_id'])
    .addUniqueConstraint('session_users_session_turn_order_unique', ['session_id', 'turn_order'])
    .execute()

  await db.schema
    .createIndex('session_users_user_id_last_visited_at_idx')
    .on('session_users')
    .columns(['user_id', 'last_visited_at'])
    .execute()

  await db.schema
    .createTable('messages')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('session_id', 'uuid', (col) => col.notNull().references('sessions.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('body', 'text', (col) => col.notNull())
    // 'system' rows are synthetic events (e.g. a "joined" notice)
    // rendered inline in the timeline rather than as a real chat
    // bubble — see services/trpc-api/src/repositories/messageRepository.ts.
    .addColumn('type', 'text', (col) => col.notNull().defaultTo('user'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('messages_session_id_created_at_idx')
    .on('messages')
    .columns(['session_id', 'created_at'])
    .execute()

  await db.schema
    .createTable('moderation_events')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('session_id', 'uuid', (col) => col.notNull().references('sessions.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('message_id', 'uuid', (col) => col.references('messages.id').onDelete('set null'))
    .addColumn('classification', 'text', (col) => col.notNull())
    .addColumn('human_reviewed', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('human_review_outcome', 'text')
    .addColumn('reviewed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('moderation_events_classification_check', sql`classification in ('pass','flag','crisis')`)
    .addCheckConstraint(
      'moderation_events_review_outcome_check',
      sql`human_review_outcome in ('true_positive','false_positive','true_negative','false_negative')`,
    )
    .execute()

  await db.schema
    .createTable('feedback_ratings')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('session_id', 'uuid', (col) => col.notNull().references('sessions.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('rating', 'smallint', (col) => col.notNull())
    .addColumn('free_text', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('feedback_ratings_rating_check', sql`rating between 1 and 5`)
    .addUniqueConstraint('feedback_ratings_session_user_unique', ['session_id', 'user_id'])
    .execute()

  // "Report this session" (SessionPage.tsx's ReportSessionModal) — a
  // user-initiated complaint, distinct from moderation_events (the AI
  // classifier's own automated pass/flag/crisis calls on message
  // content). about_user_ids is a plain jsonb array of userIds rather
  // than a Postgres uuid[] column or a join table — same convention as
  // session_users.agreements above, and there's no need to query "reports
  // about user X" efficiently yet (no review queue exists — see
  // services/trpc-api/src/services/sessionReportService.ts's doc comment
  // for why this deliberately stops at "persisted + logged," matching
  // crisisEscalationService.ts's own "nothing real to page yet" stance).
  await db.schema
    .createTable('session_reports')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('session_id', 'uuid', (col) => col.notNull().references('sessions.id').onDelete('cascade'))
    .addColumn('reporter_user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('about_user_ids', 'jsonb', (col) => col.notNull())
    .addColumn('body', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('session_reports').execute()
  await db.schema.dropTable('feedback_ratings').execute()
  await db.schema.dropTable('moderation_events').execute()
  await db.schema.dropTable('messages').execute()
  await db.schema.dropTable('session_users').execute()
  await sql`drop index if exists sessions_name_trgm_idx`.execute(db)
  await db.schema.dropTable('sessions').execute()
  await db.schema.dropTable('topics').execute()
  await db.schema.dropTable('user_profiles').execute()
  await db.schema.dropTable('user_identities').execute()
  await db.schema.dropTable('users').execute()
  await sql`drop extension if exists pg_trgm`.execute(db)
}
