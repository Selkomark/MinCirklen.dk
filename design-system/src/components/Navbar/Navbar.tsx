import type { HTMLAttributes, ReactNode } from 'react'
import { Container } from '../Container'
import './Navbar.css'

export interface NavbarProps extends HTMLAttributes<HTMLElement> {
  logo: ReactNode
  /** Nav links + actions, right-aligned. For a mobile menu, compose a `Menu` here. */
  children?: ReactNode
  sticky?: boolean
}

export function Navbar({ logo, children, sticky = false, className, ...props }: NavbarProps) {
  return (
    <header
      className={['ds-navbar', sticky && 'ds-navbar--sticky', className].filter(Boolean).join(' ')}
      {...props}
    >
      <Container className="ds-navbar__inner">
        <div className="ds-navbar__logo">{logo}</div>
        <nav className="ds-navbar__links">{children}</nav>
      </Container>
    </header>
  )
}
