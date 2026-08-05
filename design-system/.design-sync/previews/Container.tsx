import { Container, Text } from 'mincirklen-design-system'

export function Default() {
  return (
    <div style={{ background: 'var(--surface-sunken)', padding: 12, borderRadius: 8 }}>
      <Container
        style={{
          background: 'var(--surface-raised)',
          border: '1px dashed var(--border-strong)',
          borderRadius: 8,
          padding: 16,
        }}
      >
        <Text variant="small">Container — max-width 1140px, centered, responsive padding.</Text>
      </Container>
    </div>
  )
}
