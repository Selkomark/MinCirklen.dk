import { Button } from '../components/Button'
import { Alert } from '../components/Alert'
import { publicPagePath } from '../publicPages/pages'
import { SiteHeader } from '../SiteHeader'
import { SiteFooter } from '../SiteFooter'
import { GoogleIcon } from '../GoogleIcon'
import { useDocumentTitle } from '../useDocumentTitle'

// oauthController.ts's callback redirects here with ?error=<code> instead
// of ever showing its own error page — this is the only place that code
// is translated into copy a user can act on.
const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  oauth_state: 'Your sign-in link expired. Please try again.',
  google_failed: "We couldn't confirm that with Google. Please try again.",
  login_failed: 'Something went wrong on our end. Please try again.',
}

function loginErrorMessage(): string | null {
  const code = new URLSearchParams(window.location.search).get('error')
  if (!code) return null
  return LOGIN_ERROR_MESSAGES[code] ?? LOGIN_ERROR_MESSAGES.login_failed ?? null
}

// Google is the only working provider. The others are kept (not deleted)
// but hidden behind this flag so the layout/code is ready to re-enable
// them once they're wired up — flip to true, don't re-add the list.
const SHOW_OTHER_PROVIDERS = false

const OTHER_PROVIDERS = [
  { id: 'apple', label: 'Continue with Apple' },
  { id: 'microsoft', label: 'Continue with Microsoft' },
]

export function LoginPage() {
  useDocumentTitle('Log in — MinCirklen')
  const errorMessage = loginErrorMessage()

  return (
    <div style={{ minHeight: '100vh', fontFamily: 'var(--font-family-base)' }}>
      <SiteHeader showJoinCta={false} />

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: 'clamp(20px, 6vw, 64px) clamp(16px, 5vw, 24px)',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 'clamp(20px, 4vw, 28px)' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>
              Log in to MinCirklen
            </div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 6 }}>
              One quick sign-in, then straight to your circle.
            </div>
          </div>

          <div
            style={{
              background: 'var(--surface-raised)',
              border: '0.5px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: 'clamp(20px, 4vw, 32px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {errorMessage && <Alert variant="urgent">{errorMessage}</Alert>}

            <Button
              variant="secondary"
              onPress={() => {
                window.location.href = '/api/auth/google/start'
              }}
              style={{ width: '100%' }}
            >
              <GoogleIcon />
              Continue with Google
            </Button>

            {SHOW_OTHER_PROVIDERS &&
              OTHER_PROVIDERS.map((provider) => (
                <Button
                  key={provider.id}
                  variant="secondary"
                  isDisabled
                  style={{ width: '100%', justifyContent: 'space-between' }}
                >
                  <span>{provider.label}</span>
                  <span style={{ fontSize: 'var(--font-size-xs)' }}>Coming soon</span>
                </Button>
              ))}

            <Alert variant="safe" style={{ marginTop: 8 }}>
              We only use this to keep circles free of spam and duplicate accounts. Nothing
              from your account is ever shown to other users.
            </Alert>
          </div>

          <div style={{ textAlign: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            By continuing you agree to our{' '}
            <a href={publicPagePath('terms-and-conditions')} className="ds-inline-link">
              Terms and Conditions
            </a>{' '}
            and{' '}
            <a href={publicPagePath('privacy-policy')} className="ds-inline-link">
              Privacy Policy
            </a>
            .
          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  )
}
