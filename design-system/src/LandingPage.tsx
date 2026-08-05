import { Button } from './components/Button'
import { Badge } from './components/Badge'
import { Row } from './components/Row'
import { Col } from './components/Col'
import { Heading } from './components/Heading'
import { Text } from './components/Text'
import { Section } from './components/Section'
import { Navbar } from './components/Navbar'
import { Hero } from './components/Hero'
import { Feature } from './components/Feature'
import { Testimonial } from './components/Testimonial'
import { Stat } from './components/Stat'
import { CTASection } from './components/CTASection'
import { PricingCard } from './components/PricingCard'
import { Footer, FooterColumn } from './components/Footer'

export function LandingPage() {
  return (
    <div>
      <Navbar logo="MinCirklen">
        <Text as="span" variant="small">
          Circles
        </Text>
        <Text as="span" variant="small">
          About
        </Text>
        <Text as="span" variant="small">
          Safety
        </Text>
        <Button variant="safe">Join now</Button>
      </Navbar>

      <Hero>
        <Badge variant="safe">Now open</Badge>
        <Heading level={1}>A space to be heard, without judgment</Heading>
        <Text variant="lead">
          Anonymous, moderated peer-support circles — join one in minutes, no account required.
        </Text>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="safe">Join a circle</Button>
          <Button variant="secondary">Learn more</Button>
        </div>
      </Hero>

      <Section tone="raised" spacing="lg">
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
      </Section>

      <Section tone="app" spacing="xl">
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-7)' }}>
          <Heading level={2}>Built around safety</Heading>
          <Text variant="lead" style={{ marginTop: 'var(--space-2)' }}>
            Every part of the experience is designed to protect you first.
          </Text>
        </div>
        <Row gap={6}>
          <Col span={4}>
            <Feature icon="🛡" title="Moderated">
              A trained facilitator is present in every session, and you can leave or report at
              any time.
            </Feature>
          </Col>
          <Col span={4}>
            <Feature icon="🤝" title="Anonymous by default">
              Share as much or as little as you want — nobody sees your real name unless you
              choose to share it.
            </Feature>
          </Col>
          <Col span={4}>
            <Feature icon="🕊" title="No pressure">
              Listen-only is always welcome. There's no obligation to speak, and no advice-giving
              unless it's asked for.
            </Feature>
          </Col>
        </Row>
      </Section>

      <Section tone="sunken" spacing="xl">
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-7)' }}>
          <Heading level={2}>From people who've been there</Heading>
        </div>
        <Row gap={6}>
          <Col span={6}>
            <Testimonial
              quote="It helped just knowing someone else understood what I was going through."
              name="Anonymous"
              role="Weekly circle participant"
              anonymous
            />
          </Col>
          <Col span={6}>
            <Testimonial
              quote="I almost didn't join because I was nervous. The facilitator made it feel safe within minutes."
              name="Anonymous"
              role="Grief support circle"
              anonymous
            />
          </Col>
        </Row>
      </Section>

      <Section tone="app" spacing="xl">
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-7)' }}>
          <Heading level={2}>Simple, honest pricing</Heading>
        </div>
        <Row gap={6}>
          <Col span={6}>
            <PricingCard
              name="Community"
              price="Free"
              features={['Join unlimited circles', 'Anonymous by default', 'Crisis resources']}
              cta={
                <Button variant="secondary" style={{ width: '100%' }}>
                  Get started
                </Button>
              }
            />
          </Col>
          <Col span={6}>
            <PricingCard
              name="Facilitator"
              price="$29"
              period="mo"
              features={[
                'Everything in Community',
                'Host your own circles',
                'Priority moderation support',
              ]}
              cta={
                <Button variant="safe" style={{ width: '100%' }}>
                  Start hosting
                </Button>
              }
              highlighted
            />
          </Col>
        </Row>
      </Section>

      <CTASection
        title="Ready to join a circle?"
        actions={<Button variant="secondary">Get started — it's free</Button>}
      >
        It only takes a minute, and you can stay anonymous the whole way.
      </CTASection>

      <Footer bottom="© 2026 MinCirklen. All rights reserved.">
        <FooterColumn title="Product">
          <a href="#">Circles</a>
          <a href="#">Pricing</a>
          <a href="#">Safety</a>
        </FooterColumn>
        <FooterColumn title="Company">
          <a href="#">About</a>
          <a href="#">Facilitators</a>
        </FooterColumn>
        <FooterColumn title="Support">
          <a href="#">Crisis resources</a>
          <a href="#">Contact</a>
        </FooterColumn>
      </Footer>
    </div>
  )
}
