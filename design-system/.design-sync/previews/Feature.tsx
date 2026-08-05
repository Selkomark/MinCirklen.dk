import { Row, Col, Feature } from 'mincirklen-design-system'

export function Default() {
  return (
    <Row>
      <Col span={4}>
        <Feature icon="🛡" title="Moderated">
          A trained facilitator is present in every session.
        </Feature>
      </Col>
      <Col span={4}>
        <Feature icon="🤝" title="Anonymous by default">
          Share as much or as little as you want.
        </Feature>
      </Col>
      <Col span={4}>
        <Feature icon="🕊" title="No pressure">
          Listen-only is always welcome — no advice required.
        </Feature>
      </Col>
    </Row>
  )
}
