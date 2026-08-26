// CHARTER.md principle 3: a crisis disclosure always triggers a
// deterministic resource-card + human-escalation response, independent of
// what the moderation model decided, with no conditional bypass anywhere in
// the call chain. This module is that guarantee — kept small and isolated
// deliberately, so it can be audited without touching detection internals
// (roadmap Addendum D.1).

export interface CrisisResource {
  type: 'crisis_resource'
  message: string
  resources: { name: string; phone: string; url?: string }[]
}

// Pure, no dependencies — cannot fail. This is what makes the guarantee
// unconditional: the response the sender receives never depends on any I/O
// succeeding.
export function buildCrisisResource(): CrisisResource {
  return {
    type: 'crisis_resource',
    message:
      'It sounds like things are really hard right now. Please reach out to one of the resources below, or local emergency services if you are in immediate danger.',
    resources: [{ name: 'Livslinien (Denmark)', phone: '70 201 201', url: 'https://livslinien.dk' }],
  }
}

export interface EscalationParams {
  sessionId: string
  userId: string
}

export interface EscalateDeps {
  insertModerationEvent: () => Promise<void>
  // The seam a future human-paging integration hooks into — there's
  // nothing real to page yet, so this is a structured, clearly-marked log
  // line, not a fake integration.
  logEscalation: (params: EscalationParams) => void
  logCriticalFailure: (err: unknown, params: EscalationParams) => void
}

export async function escalate(deps: EscalateDeps, params: EscalationParams): Promise<CrisisResource> {
  const resource = buildCrisisResource()

  deps.logEscalation(params)

  try {
    await deps.insertModerationEvent()
  } catch (err) {
    // Withholding the resource-card response because persistence hiccuped
    // would be a worse outcome than a logged, catchable persistence gap —
    // the response firing unconditionally is the actual guarantee here,
    // logging is secondary. Deliberately swallowed, not rethrown.
    deps.logCriticalFailure(err, params)
  }

  return resource
}
