import { CTASection, Button } from 'mincirklen-design-system'

export function Default() {
  return (
    <CTASection title="Ready to join a circle?" actions={<Button variant="secondary">Get started</Button>}>
      It only takes a minute, and you can stay anonymous the whole way.
    </CTASection>
  )
}
