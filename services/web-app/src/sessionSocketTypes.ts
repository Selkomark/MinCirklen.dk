// The server->client half of websocket-service's protocol — see that
// service's controllers/wsController.ts and services/wsProtocol.ts for
// the client->server half these are paired with. Kept as its own module
// (not folded into SessionSocketProvider.tsx) so dashboardShared.tsx and
// start/shared.tsx can both depend on just the types, not the provider's
// connection-management code.
export interface RosterEntry {
  userId: string
  turnOrder: number
}

export interface RosterUpdateFrame {
  type: 'roster-update'
  sessionId: string
  currentTurnUserId: string | null
  roster: RosterEntry[]
}

export interface ParticipantJoinedFrame {
  type: 'participant-joined'
  sessionId: string
  userId: string
  turnOrder: number
}

// No top-level sessionId — trpc-api's publish payload (see
// websocket-service's internalController.ts createPublishHandler) only
// ever carries it nested under payload.sessionId. SessionSocketProvider
// routes this frame type by payload.sessionId specifically, unlike every
// other frame here which carries sessionId at the top level.
export interface MessageFrame {
  type: 'message'
  payload: { id: string; sessionId: string; userId: string; body: string; createdAt: string }
}

export interface LiveCountFrame {
  type: 'live-count-changed'
  sessionId: string
  count: number
}

// Session-scope only — a browse-scope viewer (hasn't joined) never
// receives this, only the aggregate LiveCountFrame above. See
// websocket-service's wsController.ts subscribeBrowse.
export interface OnlineUsersFrame {
  type: 'online-users-changed'
  sessionId: string
  userIds: string[]
}

export interface ErrorFrame {
  type: 'error'
  message: string
}

export type SessionFrame =
  | RosterUpdateFrame
  | ParticipantJoinedFrame
  | MessageFrame
  | LiveCountFrame
  | OnlineUsersFrame
  | ErrorFrame
  | { type: string }
