import type { CSSProperties } from 'react'
import { Navbar } from './components/Navbar'
import { ThemeToggle } from './ThemeToggle'
import { LinkButton } from './LinkButton'
import { publicPagePath } from './publicPages/pages'
import { loginPath, landingPath } from './App'

const navLinkStyle: CSSProperties = { textDecoration: 'none' }

export function SiteHeader({ showJoinCta = true }: { showJoinCta?: boolean }) {
  const logo = (
    <a href={landingPath()} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'inherit', textDecoration: 'none' }}>
      <div style={{ width: 20, height: 20, borderRadius: 'var(--radius-full)', border: '1.5px solid var(--text-primary)', flex: 'none' }} />
      <span>MinCirklen</span>
    </a>
  )

  return (
    <Navbar logo={logo}>
      <a href={publicPagePath('about')} className="ds-text ds-text--small" style={navLinkStyle}>
        About
      </a>
      <a href={publicPagePath('safety-and-moderation')} className="ds-text ds-text--small" style={navLinkStyle}>
        Safety
      </a>
      {showJoinCta && <LinkButton href={loginPath()}>Join now</LinkButton>}
      <ThemeToggle />
    </Navbar>
  )
}
