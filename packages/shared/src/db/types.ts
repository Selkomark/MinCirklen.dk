import type { ColumnType, Generated } from 'kysely'

// timestamptz columns: selected as Date, inserted as Date|string|undefined
// (defaults to now() when omitted), never updated directly through a raw
// assignment in this milestone. Bare `Generated<Date>` mismatches insert
// vs. select types for timestamptz columns — see kysely-org/kysely#789.
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>
type NullableTimestamp = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>

export interface UsersTable {
  id: Generated<string>
  created_at: Timestamp
  last_seen_at: NullableTimestamp
}

export interface SessionsTable {
  id: Generated<string>
  status: 'forming' | 'active' | 'completed' | 'cancelled'
  created_at: Timestamp
  started_at: NullableTimestamp
  ended_at: NullableTimestamp
  current_turn_user_id: string | null
  turn_claimed_at: NullableTimestamp
  // Nullable: only populated for circles created through the scheduled
  // /start/new flow — the pre-existing ad-hoc turn-based flow leaves all
  // five null. See migrations/0007_circle_scheduling.ts and
  // migrations/0008_circle_name.ts.
  topic_id: string | null
  scheduled_at: NullableTimestamp
  duration_minutes: number | null
  capacity: number | null
  name: string | null
}

export interface SessionUsersTable {
  session_id: string
  user_id: string
  joined_at: Timestamp
  left_at: NullableTimestamp
  turn_order: number | null
}

export interface MessagesTable {
  id: Generated<string>
  session_id: string
  user_id: string
  body: string
  created_at: Timestamp
}

export interface ModerationEventsTable {
  id: Generated<string>
  session_id: string
  user_id: string
  message_id: string | null
  classification: 'pass' | 'flag' | 'crisis'
  human_reviewed: Generated<boolean>
  human_review_outcome: 'true_positive' | 'false_positive' | 'true_negative' | 'false_negative' | null
  reviewed_at: NullableTimestamp
  created_at: Timestamp
}

export interface FeedbackRatingsTable {
  id: Generated<string>
  session_id: string
  user_id: string
  rating: number
  free_text: string | null
  created_at: Timestamp
}

export interface UserIdentitiesTable {
  id: Generated<string>
  user_id: string
  provider: string
  provider_subject_hash: string
  linked_at: Timestamp
}

export interface UserProfilesTable {
  id: Generated<string>
  user_id: string
  // Encrypted { firstName, lastName, mobileNumber } — see
  // migrations/0006_encrypt_user_profile_pii.ts and adapters/kmsAdapter.ts.
  // Never read/written as plaintext outside userProfileRepository.ts.
  pii_ciphertext: string
  country: string
  stay_anonymous: Generated<boolean>
  terms_accepted_at: Timestamp
  created_at: Timestamp
}

export interface TopicsTable {
  id: Generated<string>
  slug: string
  label: string
  sort_order: Generated<number>
  is_active: Generated<boolean>
  created_at: Timestamp
}

export interface Database {
  users: UsersTable
  sessions: SessionsTable
  session_users: SessionUsersTable
  messages: MessagesTable
  moderation_events: ModerationEventsTable
  feedback_ratings: FeedbackRatingsTable
  user_identities: UserIdentitiesTable
  user_profiles: UserProfilesTable
  topics: TopicsTable
}
