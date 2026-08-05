import { Footer, FooterColumn } from 'mincirklen-design-system'

export function Default() {
  return (
    <Footer bottom="© 2026 MinCirklen. All rights reserved.">
      <FooterColumn title="Product">
        <a href="#">Circles</a>
        <a href="#">Pricing</a>
      </FooterColumn>
      <FooterColumn title="Company">
        <a href="#">About</a>
        <a href="#">Safety</a>
      </FooterColumn>
    </Footer>
  )
}
