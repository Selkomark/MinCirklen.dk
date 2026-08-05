import { Alert } from 'mincirklen-design-system'

export function Variants() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Alert variant="info">This circle is moderated by a trained facilitator.</Alert>
      <Alert variant="safe">
        You're in a moderated space. Everything shared here stays within this circle.
      </Alert>
      <Alert variant="urgent">
        If you're in crisis, leave this session and contact emergency services.
      </Alert>
    </div>
  )
}

export function WithIcon() {
  return (
    <Alert variant="safe" icon="🛡">
      Your identity is never shared with other participants.
    </Alert>
  )
}
