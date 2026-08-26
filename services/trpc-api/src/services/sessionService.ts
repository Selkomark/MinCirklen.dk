import type { RosterEntry, SessionState } from '../repositories/sessionRepository'

export interface CreateSessionDeps {
  createSession(): Promise<{ id: string }>
}

export async function createSession(deps: CreateSessionDeps): Promise<{ id: string }> {
  return deps.createSession()
}

export interface JoinSessionDeps {
  joinSession(): Promise<RosterEntry>
}

export async function joinSession(deps: JoinSessionDeps): Promise<RosterEntry> {
  return deps.joinSession()
}

export interface GetSessionStateDeps {
  getSessionState(): Promise<SessionState | null>
}

export async function getSessionState(deps: GetSessionStateDeps): Promise<SessionState | null> {
  return deps.getSessionState()
}
