import { Navbar, Text, Button } from 'mincirklen-design-system'

export function Default() {
  return (
    <Navbar logo="MinCirklen">
      <Text as="span" variant="small">
        Circles
      </Text>
      <Text as="span" variant="small">
        About
      </Text>
      <Button variant="safe">Join now</Button>
    </Navbar>
  )
}
