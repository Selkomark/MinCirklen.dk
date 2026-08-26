// Roadmap Section 5's MVP cohort size (6-8 people) — the specific number
// targeted for this milestone. Tech spec's "6-12" is the later-scale range,
// not this milestone's target.
export const MAX_USERS_PER_SESSION = 8

// A turn claim older than this is treated as stale and reclaimable — self-
// heals a crashed request without needing a timer/cron sweep.
export const TURN_CLAIM_STALE_AFTER_SECONDS = 15
