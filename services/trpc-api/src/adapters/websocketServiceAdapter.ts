import type { MessageRow } from '../repositories/messageRepository'
import { NotYourTurnError, SessionNotFoundError, TurnAlreadyClaimedError, type RosterEntry } from '../repositories/sessionRepository'

export async function checkWebsocketServiceHealth(baseUrl: string): Promise<void> {
  const res = await fetch(`${baseUrl}/healthz`)
  if (!res.ok) {
    throw new Error(`status ${res.status}`)
  }
}

// Explicit constructor: see the same note in repositories/sessionRepository.ts.
export class WebsocketServiceError extends Error {
  constructor(message: string) {
    super(message)
  }
}

function internalFetch(baseUrl: string, internalServiceSecret: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-internal-secret': internalServiceSecret },
  })
}

// websocket-service's turn endpoints (internalController.ts) map their
// known failure cases to 404/403/409 — reconstructed here as the exact
// same error classes trpc-api's own toTRPCError (sessionRouter.ts)
// already maps to the right tRPC codes, so callers on this side don't
// need to know the boundary crossed a process.
function throwForTurnErrorStatus(status: number, sessionId: string): never {
  if (status === 404) throw new SessionNotFoundError(`session ${sessionId} not found`)
  if (status === 403) throw new NotYourTurnError(`user does not hold the turn for session ${sessionId}`)
  if (status === 409) throw new TurnAlreadyClaimedError(`turn for session ${sessionId} is already claimed`)
  throw new WebsocketServiceError(`status ${status}`)
}

// Relays an already-persisted, already-approved chat message to
// websocket-service for live delivery — sessionRouter.ts calls this
// fire-and-forget (never awaited into the send-message response) so a
// relay failure can never fail or delay sendMessage: the message is
// durably in Postgres by the time this runs, and a participant who missed
// the live push still sees it on their next resync (see
// dashboardShared.tsx's useSessionChat).
export async function publishMessage(
  baseUrl: string,
  internalServiceSecret: string,
  sessionId: string,
  payload: MessageRow,
): Promise<void> {
  const res = await internalFetch(baseUrl, internalServiceSecret, `/internal/rooms/${sessionId}/publish`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    throw new WebsocketServiceError(`status ${res.status}`)
  }
}

// Redis (via websocket-service) is now the live authority for
// currentTurnUserId/roster — see sessionService.ts's getSessionState,
// which composes this with a Postgres read for session lifecycle status
// (the one piece that's still Postgres's own concern).
export async function getTurnState(
  baseUrl: string,
  internalServiceSecret: string,
  sessionId: string,
): Promise<{ currentTurnUserId: string | null; roster: RosterEntry[]; onlineUserIds: string[] }> {
  const res = await internalFetch(baseUrl, internalServiceSecret, `/internal/sessions/${sessionId}/turn`)
  if (!res.ok) throwForTurnErrorStatus(res.status, sessionId)
  return (await res.json()) as { currentTurnUserId: string | null; roster: RosterEntry[]; onlineUserIds: string[] }
}

// Called after trpc-api's own Postgres join has already committed (both
// `join` and `visit` in sessionRouter.ts) — fire-and-forget, same
// rationale as publishMessage: if this doesn't land, the next getState
// read-through seeds Redis fresh from Postgres anyway (which already has
// this member by the time this call is even made), so a missed/failed
// notify only means a very slightly later live update, never a
// correctness gap.
export async function notifyJoined(
  baseUrl: string,
  internalServiceSecret: string,
  sessionId: string,
  userId: string,
  turnOrder: number,
): Promise<void> {
  const res = await internalFetch(baseUrl, internalServiceSecret, `/internal/sessions/${sessionId}/roster/join`, {
    method: 'POST',
    body: JSON.stringify({ userId, turnOrder }),
  })
  if (!res.ok) throwForTurnErrorStatus(res.status, sessionId)
}

export async function claimTurn(baseUrl: string, internalServiceSecret: string, sessionId: string, userId: string): Promise<void> {
  const res = await internalFetch(baseUrl, internalServiceSecret, `/internal/sessions/${sessionId}/turn/claim`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
  if (!res.ok) throwForTurnErrorStatus(res.status, sessionId)
}

export async function releaseTurnClaim(baseUrl: string, internalServiceSecret: string, sessionId: string): Promise<void> {
  const res = await internalFetch(baseUrl, internalServiceSecret, `/internal/sessions/${sessionId}/turn/release`, {
    method: 'POST',
  })
  if (!res.ok) throwForTurnErrorStatus(res.status, sessionId)
}

export async function advanceTurn(baseUrl: string, internalServiceSecret: string, sessionId: string): Promise<void> {
  const res = await internalFetch(baseUrl, internalServiceSecret, `/internal/sessions/${sessionId}/turn/advance`, {
    method: 'POST',
  })
  if (!res.ok) throwForTurnErrorStatus(res.status, sessionId)
}
