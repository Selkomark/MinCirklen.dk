import { Row, Col } from 'mincirklen-design-system'

const swatch = {
  background: 'var(--accent-safe-surface)',
  color: 'var(--accent-safe)',
  borderRadius: 8,
  padding: 12,
  textAlign: 'center' as const,
  fontSize: 'var(--font-size-xs)',
}

export function Equal() {
  return (
    <Row gap={2}>
      <Col><div style={swatch}>auto</div></Col>
      <Col><div style={swatch}>auto</div></Col>
      <Col><div style={swatch}>auto</div></Col>
    </Row>
  )
}

export function Sized() {
  return (
    <Row gap={2}>
      <Col span={4}><div style={swatch}>span 4</div></Col>
      <Col span={4}><div style={swatch}>span 4</div></Col>
      <Col span={4}><div style={swatch}>span 4</div></Col>
    </Row>
  )
}
