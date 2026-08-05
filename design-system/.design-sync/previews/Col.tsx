import { Row, Col } from 'mincirklen-design-system'

const swatch = {
  background: 'var(--accent-safe-surface)',
  color: 'var(--accent-safe)',
  borderRadius: 8,
  padding: 12,
  textAlign: 'center' as const,
  fontSize: 'var(--font-size-xs)',
}

export function Responsive() {
  return (
    <Row gap={2}>
      <Col span={12} md={6}><div style={swatch}>span 12, md 6</div></Col>
      <Col span={12} md={6}><div style={swatch}>span 12, md 6</div></Col>
    </Row>
  )
}
