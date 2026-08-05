import { Button } from 'mincirklen-design-system'

export function Default() {
  return <Button variant="safe">Join session</Button>
}

export function Variants() {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <Button variant="safe">Join session</Button>
      <Button variant="secondary">Learn more</Button>
      <Button variant="ghost">Skip for now</Button>
      <Button variant="urgent">Report</Button>
    </div>
  )
}
