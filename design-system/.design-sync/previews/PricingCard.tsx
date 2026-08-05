import { Row, Col, PricingCard, Button } from 'mincirklen-design-system'

export function Default() {
  return (
    <Row>
      <Col span={6}>
        <PricingCard
          name="Community"
          price="Free"
          features={['Join unlimited circles', 'Anonymous by default']}
          cta={<Button variant="secondary">Get started</Button>}
        />
      </Col>
      <Col span={6}>
        <PricingCard
          name="Facilitator"
          price="$29"
          period="mo"
          features={['Everything in Community', 'Host your own circles', 'Priority moderation support']}
          cta={<Button variant="safe">Start hosting</Button>}
          highlighted
        />
      </Col>
    </Row>
  )
}
