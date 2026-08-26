import { useCallback, useEffect, useState } from 'react'
import { ThemeProvider } from './components/ThemeProvider'
import { ToastRegionRoot } from './components/Toast'
import { Catalog } from './Catalog'
import { LandingPage } from './LandingPage'
import { DashboardPage } from './pages/DashboardPage'
import { NewSessionPage } from './pages/NewSessionPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ModerationTransparencyPage } from './pages/ModerationTransparencyPage'
import { PUBLIC_PAGES, PUBLIC_PAGE_ORDER, type PublicPageId } from './publicPages/pages'
import { PublicPageView } from './publicPages/PublicPageView'
import { CookieConsentBanner } from './CookieConsentBanner'
import './App.css'

const BASE = import.meta.env.BASE_URL

export const landingPath = () => BASE
export const systemDesignPath = () => `${BASE}system-design`
export const newSessionPath = () => `${BASE}new`
export const dashboardPath = (sessionId: string) => `${BASE}s/${sessionId}`
export const loginPath = () => `${BASE}login`
export const registerPath = () => `${BASE}register`
export const moderationTransparencyPath = () => `${BASE}moderation-transparency`

export function newSessionId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

type Route =
  | { name: 'landing' }
  | { name: 'system-design' }
  | { name: 'new-session' }
  | { name: 'dashboard'; sessionId: string }
  | { name: 'public-page'; id: PublicPageId }
  | { name: 'login' }
  | { name: 'register' }
  | { name: 'moderation-transparency' }

// Top-level path segments the app itself owns. Public page slugs (privacy-policy, etc.)
// live at the top level too ("/privacy-policy", not "/p/privacy-policy") for cleaner
// public URLs, so this list is the one thing standing between a new page id and silently
// shadowing a real app route (or vice versa) — checked at module load below, not just here.
const RESERVED_TOP_LEVEL_SEGMENTS = [
  'system-design',
  'new',
  's',
  'login',
  'register',
  'moderation-transparency',
] as const

const publicPageCollision = PUBLIC_PAGE_ORDER.find((id) =>
  (RESERVED_TOP_LEVEL_SEGMENTS as readonly string[]).includes(id),
)
if (publicPageCollision) {
  throw new Error(
    `Public page id "${publicPageCollision}" collides with a reserved app route (${RESERVED_TOP_LEVEL_SEGMENTS.join(', ')}) — rename the page.`,
  )
}

// The whole app's navigation — landing/system-design/new/dashboard/public pages — lives at
// real paths (pushState-driven, no full reloads for the in-app views) so every view is a
// shareable, bookmarkable URL. Public content pages (privacy policy, etc.) are opened via
// target="_blank" as their own full page loads (see publicPages/PublicPageView.tsx), but
// still parsed here so a direct/shared link to one renders correctly too.
function parseRoute(pathname: string): Route {
  if (!pathname.startsWith(BASE)) return { name: 'landing' }
  const rest = pathname.slice(BASE.length)

  if (rest === '' || rest === '/') return { name: 'landing' }
  if (rest.replace(/\/$/, '') === 'system-design') return { name: 'system-design' }
  if (rest.replace(/\/$/, '') === 'new') return { name: 'new-session' }
  if (rest.replace(/\/$/, '') === 'login') return { name: 'login' }
  if (rest.replace(/\/$/, '') === 'register') return { name: 'register' }
  if (rest.replace(/\/$/, '') === 'moderation-transparency') return { name: 'moderation-transparency' }

  const sessionMatch = rest.match(/^s\/([^/]+)\/?$/)
  if (sessionMatch) return { name: 'dashboard', sessionId: sessionMatch[1] }

  const pageMatch = rest.match(/^([a-z0-9-]+)\/?$/)
  const pageId = pageMatch?.[1] as PublicPageId | undefined
  if (pageId && pageId in PUBLIC_PAGES) return { name: 'public-page', id: pageId }

  return { name: 'landing' }
}

// 'anonymous' covers both "no session at all" and "has a session but it's
// never been linked to Google" — both cases need the same thing (go
// through Google login), and neither is ever enough on its own to reach a
// gated page. In-session anonymity (Charter §4, "Stay anonymous in
// circles") is a *display* choice made after this bar is cleared, not a
// substitute for clearing it — the operator's actual requirement is: real
// Google identity + a completed profile, always, no exceptions (that's
// also enforced server-side by verifiedProcedure/googleLinkedProcedure in
// controllers/trpc.ts — this is the UI-side half of the same gate, not a
// replacement for it).
type AuthStatus = { kind: 'loading' } | { kind: 'anonymous' } | { kind: 'needs-profile' } | { kind: 'verified' }

// `gateKey` is the current route's name while it's one of the gated routes
// below, or null otherwise — used as the effect dependency (not a plain
// boolean) so navigating client-side from one gated route to another (e.g.
// /register -> /new right after completing the form) re-checks instead of
// reusing a stale status from before the profile existed. The app's other
// way to become authenticated, the Google OAuth redirect, reloads the page
// and remounts this from scratch, so nothing else needs to keep this in
// sync reactively.
function useAuthStatus(gateKey: string | null): AuthStatus {
  // Keyed on the gateKey the status was fetched *for*, not just the status
  // itself. Right after navigating between two gated routes (e.g.
  // /register -> /new post-submit), gateKey changes on this render but the
  // fetch below hasn't started yet — without this, the render effect that
  // decides where to redirect would read the *previous* route's stale
  // status (e.g. needs-profile) and immediately bounce back to /register.
  // Comparing keys makes render-time staleness explicit instead of
  // depending on effect-ordering to clear it first.
  const [state, setState] = useState<{ key: string | null; status: AuthStatus }>({
    key: null,
    status: { kind: 'loading' },
  })

  useEffect(() => {
    if (gateKey === null) return

    let cancelled = false

    void (async () => {
      // A single call: 401 means no session at all; otherwise the
      // response says both whether Google is linked and whether the
      // profile is complete — see authRouter.ts's myProfile.
      const res = await fetch('/api/trpc/auth.myProfile')
      if (!res.ok) {
        if (!cancelled) setState({ key: gateKey, status: { kind: 'anonymous' } })
        return
      }

      const body = (await res.json()) as {
        result: { data: { hasLinkedIdentity: boolean; profile: unknown } }
      }
      const { hasLinkedIdentity, profile } = body.result.data

      if (!cancelled) {
        setState({
          key: gateKey,
          status: !hasLinkedIdentity ? { kind: 'anonymous' } : profile == null ? { kind: 'needs-profile' } : { kind: 'verified' },
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [gateKey])

  return state.key === gateKey ? state.status : { kind: 'loading' }
}

// Sensitive routes: real support-circle content (new-session, dashboard)
// and PII collection (register) — every one of these has a matching
// protectedProcedure on the backend (see controllers/trpc.ts), this is the
// UI-side half of the same gate, not a replacement for it.
const GATED_ROUTE_NAMES = new Set(['login', 'register', 'new-session', 'dashboard'])

function useRoute() {
  const [pathname, setPathname] = useState(() => window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((path: string) => {
    if (path !== window.location.pathname) {
      window.history.pushState(null, '', path)
    }
    setPathname(path)
  }, [])

  return { route: parseRoute(pathname), navigate }
}

function Shell() {
  const { route, navigate } = useRoute()

  const gateKey = GATED_ROUTE_NAMES.has(route.name) ? route.name : null
  const authStatus = useAuthStatus(gateKey)

  useEffect(() => {
    if (authStatus.kind === 'loading') return

    if (route.name === 'login') {
      if (authStatus.kind === 'needs-profile') navigate(registerPath())
      else if (authStatus.kind === 'verified') navigate(newSessionPath())
      return
    }

    if (route.name === 'register') {
      // A user who already has a profile has nothing to do here — send
      // them on, don't re-show the registration form.
      if (authStatus.kind === 'anonymous') navigate(loginPath())
      else if (authStatus.kind === 'verified') navigate(newSessionPath())
      return
    }

    if (route.name === 'new-session' || route.name === 'dashboard') {
      if (authStatus.kind === 'anonymous') {
        navigate(loginPath())
      } else if (authStatus.kind === 'needs-profile') {
        navigate(registerPath())
      }
    }
  }, [route.name, authStatus, navigate])

  if (route.name === 'public-page') {
    return <PublicPageView id={route.id} />
  }

  if (route.name === 'moderation-transparency') {
    return <ModerationTransparencyPage />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div
        className={[
          'ds-shell-view',
          route.name === 'dashboard' || route.name === 'system-design' ? 'ds-shell-view--fixed' : 'ds-shell-view--scroll',
        ].join(' ')}
      >
        {route.name === 'system-design' && <Catalog />}
        {route.name === 'landing' && <LandingPage />}
        {route.name === 'dashboard' && authStatus.kind === 'verified' && <DashboardPage />}
        {route.name === 'new-session' && authStatus.kind === 'verified' && (
          <NewSessionPage onComplete={() => navigate(dashboardPath(newSessionId()))} />
        )}
        {route.name === 'login' && authStatus.kind === 'anonymous' && <LoginPage />}
        {route.name === 'register' && authStatus.kind === 'needs-profile' && (
          <RegisterPage onComplete={() => navigate(newSessionPath())} />
        )}
      </div>
      <ToastRegionRoot />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <Shell />
      <CookieConsentBanner />
    </ThemeProvider>
  )
}
