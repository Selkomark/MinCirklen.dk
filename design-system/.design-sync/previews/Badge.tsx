import { Badge } from 'mincirklen-design-system'

export function Default() {
  return <Badge variant="safe">Online</Badge>
}

export function Variants() {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <Badge variant="neutral">Away</Badge>
      <Badge variant="safe">Online</Badge>
      <Badge variant="info">New</Badge>
      <Badge variant="urgent">Reported</Badge>
    </div>
  )
}
