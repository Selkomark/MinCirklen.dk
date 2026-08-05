import { Hero, Badge, Heading, Text, Button } from 'mincirklen-design-system'

export function Default() {
  return (
    <Hero>
      <Badge variant="safe">Now open</Badge>
      <Heading level={1}>A space to be heard, without judgment</Heading>
      <Text variant="lead">Anonymous, moderated peer-support circles — join one in minutes.</Text>
      <div style={{ display: 'flex', gap: 12 }}>
        <Button variant="safe">Join a circle</Button>
        <Button variant="secondary">Learn more</Button>
      </div>
    </Hero>
  )
}
