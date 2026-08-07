import { useState } from 'react'
import { ThemeProvider, useTheme } from './components/ThemeProvider'
import { Button } from './components/Button'
import { IconButton } from './components/IconButton'
import { ToastRegionRoot } from './components/Toast'
import { Catalog } from './Catalog'
import { LandingPage } from './LandingPage'
import { DashboardPage } from './pages/DashboardPage'
import { NewSessionPage } from './pages/NewSessionPage'

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <IconButton icon={theme === 'dark' ? '☀' : '☾'} label="Toggle theme" onClick={toggleTheme} />
  )
}

type View = 'catalog' | 'landing' | 'dashboard' | 'new-session'

function Nav({ view, setView }: { view: View; setView: (v: View) => void }) {
  return (
    <header
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: 'var(--space-6) var(--space-6) 0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <Button variant={view === 'catalog' ? 'safe' : 'ghost'} onClick={() => setView('catalog')}>
          Components
        </Button>
        <Button variant={view === 'landing' ? 'safe' : 'ghost'} onClick={() => setView('landing')}>
          Landing page
        </Button>
        <Button variant={view === 'dashboard' ? 'safe' : 'ghost'} onClick={() => setView('dashboard')}>
          Dashboard
        </Button>
        <Button variant={view === 'new-session' ? 'safe' : 'ghost'} onClick={() => setView('new-session')}>
          New session
        </Button>
      </div>
      <ThemeToggle />
    </header>
  )
}

function Shell() {
  const [view, setView] = useState<View>('catalog')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Nav view={view} setView={setView} />
      <div style={{ flex: 1, minHeight: 0, overflow: view === 'dashboard' ? 'hidden' : 'auto' }}>
        {view === 'catalog' && <Catalog />}
        {view === 'landing' && <LandingPage />}
        {view === 'dashboard' && <DashboardPage />}
        {view === 'new-session' && <NewSessionPage />}
      </div>
      <ToastRegionRoot />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  )
}
