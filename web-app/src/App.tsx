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
import { hasRegistered, markRegistered } from './authDemo'
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
        {route.name === 'dashboard' && <DashboardPage />}
        {route.name === 'new-session' && (
          <NewSessionPage onComplete={() => navigate(dashboardPath(newSessionId()))} />
        )}
        {route.name === 'login' && (
          <LoginPage
            onGoogleContinue={() => navigate(hasRegistered() ? newSessionPath() : registerPath())}
          />
        )}
        {route.name === 'register' && (
          <RegisterPage
            onComplete={() => {
              markRegistered()
              navigate(newSessionPath())
            }}
          />
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
