// The single source of truth for NATS subject naming, so the trpc-api
// publisher and the websocket-service subscriber can never drift apart on
// the subject scheme.
export function roomSubject(sessionId: string): string {
  return `room.${sessionId}.messages`
}
