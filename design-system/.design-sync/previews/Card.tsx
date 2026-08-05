import { Card, Avatar, Badge, Button } from 'mincirklen-design-system'

export function Default() {
  return (
    <Card>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <Avatar label="Anonymous" anonymous />
        <div>
          <div style={{ fontWeight: 600 }}>Anonymous participant</div>
          <Badge variant="safe">Online</Badge>
        </div>
      </div>
      <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
        "It helped just knowing someone else understood what I was going through."
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        <Button variant="safe">Join session</Button>
        <Button variant="secondary">Learn more</Button>
      </div>
    </Card>
  )
}

export function Compact() {
  return (
    <Card padded={false}>
      <div style={{ padding: 16, borderBottom: '1px solid var(--border-subtle)', fontWeight: 600 }}>
        Weekly circle
      </div>
      <div style={{ padding: 16, color: 'var(--text-secondary)' }}>
        Tuesdays, 7pm — 6 participants
      </div>
    </Card>
  )
}
