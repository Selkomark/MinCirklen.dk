import { Badge } from './components/Badge'
import { Row } from './components/Row'
import { Col } from './components/Col'
import { Heading } from './components/Heading'
import { Text } from './components/Text'
import { Section } from './components/Section'
import { Hero } from './components/Hero'
import { Feature } from './components/Feature'
import { Testimonial } from './components/Testimonial'
import { Stat } from './components/Stat'
import { CTASection } from './components/CTASection'
import { PricingCard } from './components/PricingCard'
import { publicPagePath } from './publicPages/pages'
import { loginPath, landingPath } from './App'
import { SiteHeader } from './SiteHeader'
import { SiteFooter } from './SiteFooter'
import { LinkButton } from './LinkButton'
import { usePageMeta } from './usePageMeta'
import { useJsonLd } from './useJsonLd'
import { SITE_ORIGIN, SITE_NAME } from './siteConfig'
import heroImage from './assets/hero-circle.webp'

const DESCRIPTION =
  "MinCirklen is an anonymous, AI-moderated peer-support platform. No profiles, no directory, no way to look anyone up — just small, moderated circles to be heard in."

export function LandingPage() {
  const pageUrl = `${SITE_ORIGIN}${landingPath()}`
  const imageUrl = `${SITE_ORIGIN}${heroImage}`

  usePageMeta({
    title: 'MinCirklen — Anonymous, moderated peer-support circles',
    description: DESCRIPTION,
    path: landingPath(),
    image: imageUrl,
  })

  useJsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: SITE_NAME,
        url: pageUrl,
        description: DESCRIPTION,
        logo: imageUrl,
      },
      {
        '@type': 'WebSite',
        name: SITE_NAME,
        url: pageUrl,
        description: DESCRIPTION,
      },
    ],
  })

  return (
    <div>
      <SiteHeader />

      <Hero
        align="left"
        media={
          <img
            src={heroImage}
            width={640}
            height={640}
            alt="Illustration of people in a MinCirklen peer-support circle, talking anonymously and at ease"
            fetchPriority="high"
          />
        }
      >
        <Badge variant="safe">Just launched — early pilot</Badge>
        <Heading level={1}>A space to be heard, without judgment</Heading>
        <Text variant="lead">
          Anonymous, moderated peer-support circles. We're brand new — join one of our first circles and help shape what this becomes.
        </Text>
        <div style={{ display: 'flex', gap: 12 }}>
          <LinkButton href={loginPath()}>Join a circle</LinkButton>
          <LinkButton href={publicPagePath('how-it-works')} variant="secondary">
            Learn more
          </LinkButton>
        </div>
      </Hero>

      <Section tone="raised" spacing="lg">
        <Row>
          <Col span={12} md={6}>
            <Stat value="Anonymous" label="By default, every circle" />
          </Col>
          <Col span={12} md={6}>
            <Stat value="Zero" label="Profiles, directories, or ways to look someone up" />
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
          <Col span={12} md={4}>
            <Feature icon="🛡" title="Moderated">
              A trained facilitator is present in every session, and you can leave or report at
              any time.
            </Feature>
          </Col>
          <Col span={12} md={4}>
            <Feature icon="🤝" title="Anonymous by default">
              Share as much or as little as you want — nobody sees your real name unless you
              choose to share it.
            </Feature>
          </Col>
          <Col span={12} md={4}>
            <Feature icon="🕊" title="No pressure">
              Listen-only is always welcome. There's no obligation to speak, and no advice-giving
              unless it's asked for.
            </Feature>
          </Col>
        </Row>
      </Section>

      <Section tone="sunken" spacing="xl">
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-7)' }}>
          <Heading level={2}>Why we're building this</Heading>
        </div>
        <Row>
          <Col span={12} md={8} style={{ margin: '0 auto' }}>
            <Testimonial
              quote="Make a safe and cosy place on the internet where people can finally open up. That's the whole idea — we're just getting started, and we'd rather grow slowly and safely than fast and reckless."
              name="Mahan Sagharchi"
              role="Founder, MinCirklen"
            />
          </Col>
        </Row>
      </Section>

      <Section tone="app" spacing="xl">
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-7)' }}>
          <Heading level={2}>Simple, honest pricing</Heading>
          <Text variant="lead" style={{ marginTop: 'var(--space-2)' }}>
            We're in early pilot and haven't set pricing yet — there will always be a free way in.
          </Text>
        </div>
        <Row gap={6}>
          <Col span={12} md={6}>
            <PricingCard
              name="Free, during pilot"
              price="Free"
              features={['Unlimited sessions', 'Anonymous by default', 'No limit on conversation length']}
              cta={
                <LinkButton href={loginPath()} variant="secondary" style={{ width: '100%' }}>
                  Get started
                </LinkButton>
              }
            />
          </Col>
          <Col span={12} md={6}>
            <PricingCard
              name="Support MinCirklen"
              price="TBD"
              period="pricing to be decided"
              features={[
                'A way to help fund hosting and safety review',
                'Same turn length and typing time as free',
                "We'll announce details before anything changes",
              ]}
              cta={
                <LinkButton href={loginPath()} style={{ width: '100%' }}>
                  Get started
                </LinkButton>
              }
              highlighted
            />
          </Col>
        </Row>
      </Section>

      <CTASection
        title="Ready to join a circle?"
        actions={<LinkButton href={loginPath()} variant="secondary">Get started — it's free</LinkButton>}
      >
        It only takes a minute, and you can stay anonymous the whole way.
      </CTASection>

      <SiteFooter />
    </div>
  )
}
