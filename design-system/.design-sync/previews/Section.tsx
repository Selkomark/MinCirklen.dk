import { Section, Text } from 'mincirklen-design-system'

export function Tones() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Section tone="sunken" spacing="md" style={{ borderRadius: 8 }}>
        <Text variant="small">tone="sunken" spacing="md"</Text>
      </Section>
      <Section
        tone="raised"
        spacing="md"
        style={{ borderRadius: 8, border: '1px solid var(--border-subtle)' }}
      >
        <Text variant="small">tone="raised" spacing="md"</Text>
      </Section>
    </div>
  )
}
