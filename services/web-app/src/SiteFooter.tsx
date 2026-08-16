import { Footer, FooterColumn } from './components/Footer'
import { publicPagePath } from './publicPages/pages'
import { newSessionPath, moderationTransparencyPath } from './App'
import { showCookiePreferences } from './CookieConsentBanner'

export function SiteFooter() {
  return (
    <Footer
      bottom={
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-4)' }}>
          <span>© 2026 Selkomark. All rights reserved.</span>
          <button
            type="button"
            onClick={showCookiePreferences}
            className="ds-inline-link"
            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
          >
            Cookie preferences
          </button>
        </div>
      }
    >
      <FooterColumn title="Product">
        <a href={newSessionPath()}>Circles</a>
        <a href={publicPagePath('how-it-works')}>How it works</a>
        <a href={publicPagePath('pricing')}>Pricing</a>
        <a href={publicPagePath('safety-and-moderation')}>Safety</a>
        <a href={moderationTransparencyPath()}>Moderation & transparency</a>
      </FooterColumn>
      <FooterColumn title="Company">
        <a href={publicPagePath('about')}>About</a>
        <a href={publicPagePath('facilitators')}>Facilitators</a>
      </FooterColumn>
      <FooterColumn title="Support">
        <a href={publicPagePath('crisis-resources')}>Crisis resources</a>
        <a href={publicPagePath('account-and-data')}>Account and data</a>
        <a href={publicPagePath('contact')}>Contact</a>
      </FooterColumn>
      <FooterColumn title="Legal">
        <a href={publicPagePath('privacy-policy')}>Privacy policy</a>
        <a href={publicPagePath('community-guidelines')}>Community guidelines</a>
        <a href={publicPagePath('terms-and-conditions')}>Terms and conditions</a>
      </FooterColumn>
    </Footer>
  )
}
