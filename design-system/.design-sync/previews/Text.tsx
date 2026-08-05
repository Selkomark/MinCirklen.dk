import { Text } from 'mincirklen-design-system'

export function Variants() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Text variant="lead">A lead paragraph — slightly larger, for the opening line of a section.</Text>
      <Text variant="body">Body text is the default for everything else.</Text>
      <Text variant="muted">Muted text, for secondary/supporting information.</Text>
      <Text variant="small">Small text, for fine print.</Text>
    </div>
  )
}
