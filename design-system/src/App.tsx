import { useState } from 'react'
import { ThemeProvider, useTheme } from './components/ThemeProvider'
import { Button } from './components/Button'
import { Card } from './components/Card'
import { Badge } from './components/Badge'
import { Alert } from './components/Alert'
import { Avatar } from './components/Avatar'
import { TextField } from './components/TextField'
import { IconButton } from './components/IconButton'
import { ToastRegionRoot } from './components/Toast'
import { Catalog } from './Catalog'
import { LandingPage } from './LandingPage'

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <IconButton icon={theme === 'dark' ? '☀' : '☾'} label="Toggle theme" onClick={toggleTheme} />
  )
}

type View = 'catalog' | 'preview' | 'landing'

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
        <Button variant={view === 'preview' ? 'safe' : 'ghost'} onClick={() => setView('preview')}>
          Product preview
        </Button>
        <Button variant={view === 'landing' ? 'safe' : 'ghost'} onClick={() => setView('landing')}>
          Landing page
        </Button>
      </div>
      <ThemeToggle />
    </header>
  )
}

function Preview() {
  return (
    <div
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: 'var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ fontSize: 'var(--font-size-2xl)', margin: 0 }}>MinCirklen</h1>

      <Alert variant="safe">
        You're in a moderated space. Everything shared here stays within this circle.
      </Alert>

      <Card>
        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
          <Avatar label="Anonymous" anonymous />
          <div>
            <div style={{ fontWeight: 'var(--font-weight-medium)' }}>Anonymous participant</div>
            <Badge variant="safe">Online</Badge>
          </div>
        </div>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          "It helped just knowing someone else understood what I was going through."
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <Button variant="safe">Join session</Button>
          <Button variant="secondary">Learn more</Button>
        </div>
      </Card>

      <Card>
        <TextField
          label="Share something"
          hint="Only visible to this circle"
          placeholder="Type here..."
        />
      </Card>

      <Alert variant="urgent">
        If you're in crisis, leave this session and contact emergency services.
      </Alert>

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <Button variant="urgent">Report</Button>
        <IconButton icon="✕" label="Leave session" variant="urgent" />
      </div>
    </div>
  )
}

function Shell() {
  const [view, setView] = useState<View>('catalog')
  return (
    <>
      <Nav view={view} setView={setView} />
      {view === 'catalog' && <Catalog />}
      {view === 'preview' && <Preview />}
      {view === 'landing' && <LandingPage />}
      <ToastRegionRoot />
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  )
}
