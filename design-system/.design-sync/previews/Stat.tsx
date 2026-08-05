import { Row, Col, Stat } from 'mincirklen-design-system'

export function Default() {
  return (
    <Row>
      <Col span={4}>
        <Stat value="1,200+" label="Circles hosted" />
      </Col>
      <Col span={4}>
        <Stat value="98%" label="Would recommend" />
      </Col>
      <Col span={4}>
        <Stat value="24/7" label="Moderated access" />
      </Col>
    </Row>
  )
}
