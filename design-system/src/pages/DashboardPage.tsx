import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/Button'
import { Avatar } from '../components/Avatar'
import { Checkbox } from '../components/Checkbox'
import './DashboardPage.css'

type SessionGroup = 'week' | 'earlier'

interface Session {
  id: string
  name: string
  group: SessionGroup
  status: string
  live?: boolean
  isNew?: boolean
}

interface ParticipantInfo {
  id: string
  label: string
  initials: string
  bg: string
}

interface Message {
  participantId: string
  text: string
}

const BASE_SESSIONS: Session[] = [
  { id: 'w1', name: 'Weekly grief circle', group: 'week', status: 'Live now', live: true },
  { id: 'w2', name: 'Anxiety support circle', group: 'week', status: 'Tue, 7:00 pm' },
  { id: 'w3', name: 'New parents circle', group: 'week', status: 'Mon, 6:30 pm' },
  { id: 'w4', name: 'Chronic illness circle', group: 'week', status: 'Sun, 5:00 pm' },
  { id: 'w5', name: 'Career transitions circle', group: 'week', status: 'Sat, 4:00 pm' },
  { id: 'w6', name: 'Sleep and insomnia circle', group: 'week', status: 'Fri, 8:00 pm' },
  { id: 'e1', name: 'Weekly grief circle', group: 'earlier', status: 'Jul 28' },
  { id: 'e2', name: 'Anxiety support circle', group: 'earlier', status: 'Jul 21' },
  { id: 'e3', name: 'New parents circle', group: 'earlier', status: 'Jul 14' },
  { id: 'e4', name: 'Divorce and separation circle', group: 'earlier', status: 'Jul 10' },
  { id: 'e5', name: 'Caregiver support circle', group: 'earlier', status: 'Jul 3' },
  { id: 'e6', name: 'Social anxiety circle', group: 'earlier', status: 'Jun 26' },
]

// Fixed dark text color on every avatar so initials stay readable against any pastel background.
const AVATAR_TEXT = '#2b2b2b'

const PARTICIPANTS: ParticipantInfo[] = [
  { id: 'you', label: 'You', initials: 'Y', bg: 'var(--accent-safe)' },
  { id: 'p1', label: 'Participant 1', initials: 'P1', bg: 'oklch(90% 0.06 40)' },
  { id: 'p2', label: 'Participant 2', initials: 'P2', bg: 'oklch(90% 0.06 210)' },
  { id: 'p3', label: 'Participant 3', initials: 'P3', bg: 'oklch(90% 0.06 300)' },
  { id: 'p4', label: 'Participant 4', initials: 'P4', bg: 'oklch(90% 0.06 145)' },
  { id: 'fac', label: 'Facilitator', initials: 'F', bg: 'var(--surface-sunken)' },
]

const GRIEF_MESSAGES: Message[] = [
  { participantId: 'p1', text: "I think this week has been harder than usual. My mom's birthday would have been Thursday." },
  { participantId: 'p2', text: "That sounds like it's sitting heavy. Thank you for sharing it with us." },
  { participantId: 'you', text: "I felt something similar around my dad's anniversary last month. The date itself carries weight even when you're not expecting it." },
  { participantId: 'p1', text: "Yes, exactly. I didn't even realize it was coming until I saw the date on my phone." },
  { participantId: 'p3', text: 'Do you have anything planned for the day, or are you taking it as it comes?' },
  { participantId: 'p1', text: 'I might light a candle in the evening. Nothing big.' },
  { participantId: 'you', text: 'That sounds like a good way to mark it without making it overwhelming.' },
  { participantId: 'p2', text: 'Thank you. It helps to say it out loud here.' },
]

const REPLIES = [
  'That resonates with what I was feeling too.',
  'Thank you for sharing that.',
  "I hadn't thought about it that way.",
  'It means a lot that you said that here.',
]

function participantById(id: string) {
  return PARTICIPANTS.find((p) => p.id === id) ?? PARTICIPANTS[1]
}

function ParticipantAvatar({
  participant,
  size = 32,
  ringed = false,
}: {
  participant: ParticipantInfo
  size?: number
  ringed?: boolean
}) {
  return (
    <Avatar
      label={participant.label}
      title={participant.label}
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size <= 28 ? 10 : 11,
        fontWeight: 'var(--font-weight-bold)' as unknown as number,
        background: participant.bg,
        color: AVATAR_TEXT,
        boxShadow: ringed ? '0 0 0 2px var(--surface-raised), 0 0 0 4px var(--accent-safe)' : 'none',
      }}
    >
      {participant.initials}
    </Avatar>
  )
}

export function DashboardPage() {
  const [sessions, setSessions] = useState<Session[]>(BASE_SESSIONS)
  const [activeId, setActiveId] = useState('w1')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sendMenuOpen, setSendMenuOpen] = useState(false)
  const [sentMessages, setSentMessages] = useState<Message[]>([])
  const [turnHolder, setTurnHolder] = useState<string>('you')
  const [secondsLeft, setSecondsLeft] = useState(20)
  const [isTyping, setIsTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const [autoSendOff, setAutoSendOff] = useState(false)
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>()

  const active = sessions.find((s) => s.id === activeId)!
  const isGriefLive = active.id === 'w1'
  const sessionIsLive = isGriefLive || !!active.isNew

  const messages: Message[] = isGriefLive
    ? [...GRIEF_MESSAGES, ...sentMessages]
    : active.isNew
      ? sentMessages
      : []

  useEffect(() => {
    if (!isGriefLive) return
    const interval = setInterval(() => {
      if (turnHolder !== 'you' || isTyping) return
      setSecondsLeft((s) => {
        if (s <= 1) {
          finishTurn()
          return 20
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnHolder, isTyping, isGriefLive])

  function onDraftChange(value: string) {
    setDraft(value)
    setIsTyping(true)
    clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(() => setIsTyping(false), 3000)
  }

  function scheduleReply() {
    const others = ['p1', 'p2', 'p3', 'p4']
    const replyingId = others[Math.floor(Math.random() * others.length)]
    setTurnHolder(replyingId)
    setTimeout(() => {
      const text = REPLIES[Math.floor(Math.random() * REPLIES.length)]
      setSentMessages((m) => [...m, { participantId: replyingId, text }])
      setTurnHolder('you')
      setSecondsLeft(20)
    }, 3000)
  }

  function sendNow() {
    const text = draft.trim()
    if (!text) return
    setSentMessages((m) => [...m, { participantId: 'you', text }])
    setDraft('')
    setIsTyping(false)
    setSecondsLeft(20)
    setTurnHolder('pending')
    setSendMenuOpen(false)
    scheduleReply()
  }

  function finishTurn() {
    const text = draft.trim()
    if (!autoSendOff && text) {
      setSentMessages((m) => [...m, { participantId: 'you', text }])
    }
    setDraft('')
    setIsTyping(false)
    setTurnHolder('pending')
    setSendMenuOpen(false)
    scheduleReply()
  }

  function selectSession(id: string) {
    setActiveId(id)
    setMobileMenuOpen(false)
    setSendMenuOpen(false)
  }

  function newSession() {
    const id = `new-${Date.now()}`
    const session: Session = { id, name: 'New session', group: 'week', status: 'Live now', live: true, isNew: true }
    setSessions((s) => [session, ...s])
    setActiveId(id)
    setMobileMenuOpen(false)
  }

  const thisWeek = sessions.filter((s) => s.group === 'week')
  const earlier = sessions.filter((s) => s.group === 'earlier')
  const currentTurnId = turnHolder === 'you' ? 'you' : turnHolder === 'pending' ? null : turnHolder
  const currentTurnLabel = currentTurnId ? participantById(currentTurnId).label : ''
  const isYourTurn = isGriefLive && turnHolder === 'you'
  const turnStatusText = !sessionIsLive
    ? 'Session not active'
    : isYourTurn
      ? "It's your turn"
      : currentTurnLabel
        ? `${currentTurnLabel} is typing···`
        : 'Waiting for the next participant'

  const subtitle =
    active.group === 'earlier'
      ? 'Anonymous by default'
      : sessionIsLive
        ? 'Anonymous by default'
        : `Starts ${active.status} · anonymous by default`

  const sidebarContent = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 22, height: 22, borderRadius: 'var(--radius-full)', border: '1.5px solid var(--text-primary)' }} />
        <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)' as unknown as number, color: 'var(--text-primary)' }}>
          MinCirklen
        </span>
      </div>
      <Button variant="safe" onPress={newSession} style={{ width: '100%' }}>
        New session
      </Button>
      <input
        placeholder="Search sessions"
        className="ds-textfield__input"
        style={{ width: '100%', boxSizing: 'border-box' }}
      />
      <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {[
          ['This week', thisWeek],
          ['Earlier', earlier],
        ].map(([label, list]) => (
          <div key={label as string}>
            <div
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-secondary)',
                fontWeight: 'var(--font-weight-medium)' as unknown as number,
                padding: 'var(--space-1) var(--space-2)',
              }}
            >
              {label as string}
            </div>
            {(list as Session[]).map((s) => (
              <div
                key={s.id}
                onClick={() => selectSession(s.id)}
                style={{
                  cursor: 'pointer',
                  padding: 'var(--space-2)',
                  borderRadius: 'var(--radius-md)',
                  background: s.id === activeId ? 'var(--accent-safe-surface)' : 'transparent',
                }}
              >
                <div
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: (s.id === activeId ? 'var(--font-weight-bold)' : 'var(--font-weight-regular)') as unknown as number,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {s.name}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{s.status}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )

  const rightPanelContent = (
    <>
      <div>
        <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)' as unknown as number, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
          Essential pages
        </div>
        {['How it works', 'Safety and moderation', 'Account and data'].map((label) => (
          <a key={label} href="#" style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', padding: 'var(--space-2) 0' }}>
            {label}
          </a>
        ))}
      </div>
      <div style={{ borderTop: '0.5px solid var(--border-subtle)' }} />
      <div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
          If you're in crisis
        </div>
        <a
          href="#"
          style={{
            display: 'block',
            background: 'var(--signal-urgent-surface)',
            color: 'var(--signal-urgent)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3) var(--space-3)',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-bold)' as unknown as number,
            marginBottom: 'var(--space-2)',
            textAlign: 'center',
          }}
        >
          Crisis resources
        </a>
        <a href="#" style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', textAlign: 'center' }}>
          Report this session
        </a>
      </div>
    </>
  )

  return (
    <div className="dash-root" style={{ display: 'flex', height: '100%', fontFamily: 'var(--font-family-base)', background: 'var(--surface-app)' }}>
      {/* Sidebar */}
      <div
        className="dash-sidebar"
        style={{
          width: 260,
          flex: 'none',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '0.5px solid var(--border-subtle)',
          padding: 'var(--space-5) var(--space-4)',
          gap: 'var(--space-4)',
          background: 'var(--surface-raised)',
        }}
      >
        {sidebarContent}
      </div>

      {mobileMenuOpen && <div className="dash-drawer-backdrop" onClick={() => setMobileMenuOpen(false)} />}

      <div className={['dash-drawer', mobileMenuOpen && 'dash-drawer--open'].filter(Boolean).join(' ')}>
        <div className="dash-drawer__section">{sidebarContent}</div>
        <div className="dash-drawer__divider" />
        <div className="dash-drawer__section">{rightPanelContent}</div>
      </div>

      {/* Center panel */}
      <div className="dash-center" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div
          style={{
            padding: 'var(--space-4) var(--space-6)',
            borderBottom: '0.5px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button
              type="button"
              className="dash-mobile-toggle"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle menu"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
            <div>
              <div style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)' as unknown as number, color: 'var(--text-primary)' }}>
                {active.name}
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 2 }}>{subtitle}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {PARTICIPANTS.map((p) => (
              <ParticipantAvatar key={p.id} participant={p} size={28} ringed={p.id === currentTurnId} />
            ))}
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginLeft: 4 }}>
              {PARTICIPANTS.length} participants
            </span>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-5) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {messages.length === 0 && (
            <div style={{ margin: 'auto', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', textAlign: 'center', maxWidth: 320 }}>
              {active.group === 'earlier'
                ? 'This session has ended. Transcripts are only visible to participants during the live round.'
                : active.isNew
                  ? 'Waiting for the circle to begin.'
                  : 'This circle has not started yet. You will be notified when the round begins.'}
            </div>
          )}
          {messages.map((m, i) => {
            const p = participantById(m.participantId)
            return (
              <div key={i} style={{ display: 'flex', gap: 10, maxWidth: 560 }}>
                <ParticipantAvatar participant={p} size={32} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{p.label}</span>
                  <div
                    style={{
                      background: m.participantId === 'you' ? 'var(--accent-safe-surface)' : 'var(--surface-raised)',
                      border: '0.5px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-3) var(--space-4)',
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--text-primary)',
                      lineHeight: 'var(--line-height-base)',
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ borderTop: '0.5px solid var(--border-subtle)', padding: 'var(--space-4) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: isYourTurn ? 'var(--accent-safe)' : 'var(--text-secondary)', fontWeight: isYourTurn ? ('var(--font-weight-medium)' as unknown as number) : undefined }}>
            {turnStatusText}
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="ds-textfield__input"
              style={{ flex: '1 1 160px', boxSizing: 'border-box' }}
              disabled={!isYourTurn}
              value={isYourTurn ? draft : ''}
              onChange={(e) => onDraftChange(e.target.value)}
              placeholder="Share when it's your turn"
            />
            <div className="dash-composer-actions--desktop">
              {isYourTurn && (
                <>
                  <Checkbox isSelected={autoSendOff} onChange={setAutoSendOff}>
                    Don't send automatically
                  </Checkbox>
                  <div
                    title="Time left before auto-send"
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-sm)',
                      border: '0.5px solid var(--border-subtle)',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 'var(--font-weight-bold)' as unknown as number,
                      color: isTyping ? 'var(--text-secondary)' : 'var(--accent-safe)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {secondsLeft}s
                  </div>
                </>
              )}
              <Button variant="safe" isDisabled={!isYourTurn} onPress={sendNow}>
                Send
              </Button>
            </div>

            <div className="dash-composer-actions--mobile">
              <div className="dash-send-split">
                <button type="button" className="dash-send-split__main" disabled={!isYourTurn} onClick={sendNow}>
                  Send{isYourTurn ? ` (${secondsLeft}s)` : ''}
                </button>
                {isYourTurn && (
                  <button
                    type="button"
                    className="dash-send-split__toggle"
                    onClick={() => setSendMenuOpen((v) => !v)}
                    aria-label="Send options"
                    aria-expanded={sendMenuOpen}
                  >
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
                      <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
                {sendMenuOpen && isYourTurn && (
                  <div className="dash-send-menu">
                    <Checkbox isSelected={autoSendOff} onChange={setAutoSendOff}>
                      Don't send automatically
                    </Checkbox>
                  </div>
                )}
              </div>
              {sendMenuOpen && isYourTurn && (
                <div className="dash-send-backdrop" onClick={() => setSendMenuOpen(false)} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div
        className="dash-right"
        style={{
          width: 200,
          flex: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          borderLeft: '0.5px solid var(--border-subtle)',
          padding: 'var(--space-5) var(--space-4)',
          background: 'var(--surface-raised)',
        }}
      >
        {rightPanelContent}
      </div>
    </div>
  )
}
