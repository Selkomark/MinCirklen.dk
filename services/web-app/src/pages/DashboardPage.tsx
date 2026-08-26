import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/Button'
import { Avatar } from '../components/Avatar'
import { Checkbox } from '../components/Checkbox'
import { Modal } from '../components/Modal'
import { Textarea } from '../components/Textarea'
import { addToast } from '../components/Toast'
import { ThemeToggle } from '../ThemeToggle'
import { PUBLIC_PAGES, publicPagePath } from '../publicPages/pages'
import { moderationTransparencyPath } from '../App'
import { useDocumentTitle } from '../useDocumentTitle'
import './DashboardPage.css'

const COMMUNITY_RULES = [
  {
    icon: '🔒',
    title: 'Protect your anonymity',
    description:
      "Never share your full name, phone number, address, email, or other identifying details in a circle — yours or anyone else's.",
  },
  {
    icon: '📢',
    title: 'No advertising or soliciting',
    description:
      "Don't promote a business, service, or product, and don't ask other users to pay for anything.",
  },
  {
    icon: '⚠️',
    title: 'No endorsements or recommendations',
    description:
      "Don't recommend or endorse specific practitioners, treatments, or outside services. This isn't a referral space.",
  },
  {
    icon: '🤝',
    title: "Support, don't direct",
    description: "Share your own experience, not medical or legal advice. Listening is always enough.",
  },
  {
    icon: '🚨',
    title: 'Report or leave anytime',
    description:
      "If something feels wrong, or you're in crisis, use Report or Crisis resources right away. Nobody has to explain why they left.",
  },
] as const

// The DS Button has no disabled visual treatment (no opacity/cursor change in Button.css),
// so the final agreement step — which must stay disabled until the checkbox is checked —
// is built as a plain button carrying that state explicitly.
function PrimaryButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 44,
        padding: '0 22px',
        borderRadius: 'var(--radius-md)',
        border: 'none',
        background: 'var(--accent-safe)',
        color: 'var(--text-on-accent)',
        fontFamily: 'var(--font-family-base)',
        fontSize: 'var(--font-size-md)',
        fontWeight: 'var(--font-weight-medium)',
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

// Same disabled-state workaround as PrimaryButton, colored for the urgent/report action.
function DangerButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 44,
        padding: '0 22px',
        borderRadius: 'var(--radius-md)',
        border: 'none',
        background: 'var(--signal-urgent)',
        color: 'var(--text-on-accent)',
        fontFamily: 'var(--font-family-base)',
        fontSize: 'var(--font-size-md)',
        fontWeight: 'var(--font-weight-medium)',
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function CommunityGuidelinesModal({ isOpen, onAgree }: { isOpen: boolean; onAgree: () => void }) {
  const [step, setStep] = useState(0)
  const [agreed, setAgreed] = useState(false)
  const totalSteps = COMMUNITY_RULES.length + 1
  const onLastRule = step === COMMUNITY_RULES.length - 1
  const onAgreementStep = step === COMMUNITY_RULES.length

  return (
    <Modal isOpen={isOpen} isDismissable={false} isKeyboardDismissDisabled>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: 3,
                  flex: 1,
                  borderRadius: 'var(--radius-full)',
                  background: i <= step ? 'var(--accent-safe)' : 'var(--border-subtle)',
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            Step {step + 1} of {totalSteps}
          </span>
        </div>

        {!onAgreementStep ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ fontSize: 32 }}>{COMMUNITY_RULES[step].icon}</div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)' as unknown as number, color: 'var(--text-primary)' }}>
              {COMMUNITY_RULES[step].title}
            </div>
            <div style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-secondary)', lineHeight: 'var(--line-height-base)' }}>
              {COMMUNITY_RULES[step].description}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)' as unknown as number, color: 'var(--text-primary)' }}>
                Before you join
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 'var(--line-height-base)' }}>
                These rules are non-negotiable and apply to every circle. Breaking them can get a session ended or an account removed.
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <Checkbox isSelected={agreed} onChange={setAgreed} />
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                I have read and agree to the{' '}
                <a href={publicPagePath('community-guidelines')} target="_blank" rel="noopener noreferrer" className="ds-inline-link">
                  community guidelines
                </a>{' '}
                and the{' '}
                <a href={publicPagePath('privacy-policy')} target="_blank" rel="noopener noreferrer" className="ds-inline-link">
                  privacy policy
                </a>
                .
              </span>
            </label>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} style={{ visibility: step > 0 ? 'visible' : 'hidden' }}>
            Back
          </Button>
          {!onAgreementStep ? (
            <PrimaryButton onClick={() => setStep((s) => s + 1)}>{onLastRule ? 'Continue' : 'Next'}</PrimaryButton>
          ) : (
            <PrimaryButton disabled={!agreed} onClick={onAgree}>
              Agree and continue
            </PrimaryButton>
          )}
        </div>
      </div>
    </Modal>
  )
}

type SessionGroup = 'week' | 'earlier'

interface Session {
  id: string
  name: string
  group: SessionGroup
  status: string
  live?: boolean
  isNew?: boolean
}

interface UserInfo {
  id: string
  label: string
  initials: string
  bg: string
}

interface Message {
  userId: string
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

const USERS: UserInfo[] = [
  { id: 'you', label: 'You', initials: 'Y', bg: 'var(--accent-safe)' },
  { id: 'p1', label: 'User 1', initials: 'P1', bg: 'oklch(90% 0.06 40)' },
  { id: 'p2', label: 'User 2', initials: 'P2', bg: 'oklch(90% 0.06 210)' },
  { id: 'p3', label: 'User 3', initials: 'P3', bg: 'oklch(90% 0.06 300)' },
  { id: 'p4', label: 'User 4', initials: 'P4', bg: 'oklch(90% 0.06 145)' },
  { id: 'fac', label: 'Facilitator', initials: 'F', bg: 'var(--surface-sunken)' },
]

const GRIEF_MESSAGES: Message[] = [
  { userId: 'p1', text: "I think this week has been harder than usual. My mom's birthday would have been Thursday." },
  { userId: 'p2', text: "That sounds like it's sitting heavy. Thank you for sharing it with us." },
  { userId: 'you', text: "I felt something similar around my dad's anniversary last month. The date itself carries weight even when you're not expecting it." },
  { userId: 'p1', text: "Yes, exactly. I didn't even realize it was coming until I saw the date on my phone." },
  { userId: 'p3', text: 'Do you have anything planned for the day, or are you taking it as it comes?' },
  { userId: 'p1', text: 'I might light a candle in the evening. Nothing big.' },
  { userId: 'you', text: 'That sounds like a good way to mark it without making it overwhelming.' },
  { userId: 'p2', text: 'Thank you. It helps to say it out loud here.' },
]

const REPLIES = [
  'That resonates with what I was feeling too.',
  'Thank you for sharing that.',
  "I hadn't thought about it that way.",
  'It means a lot that you said that here.',
]

function userById(id: string) {
  return USERS.find((p) => p.id === id) ?? USERS[1]
}

function UserAvatar({
  user,
  size = 32,
  ringed = false,
}: {
  user: UserInfo
  size?: number
  ringed?: boolean
}) {
  return (
    <Avatar
      label={user.label}
      title={user.label}
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
        background: user.bg,
        color: AVATAR_TEXT,
        boxShadow: ringed ? '0 0 0 2px var(--surface-raised), 0 0 0 4px var(--accent-safe)' : 'none',
      }}
    >
      {user.initials}
    </Avatar>
  )
}

// Matches NewSessionPage's Chip pattern (pill-style choice control), reused here so the
// "who is this about" picker looks consistent with the rest of the product.
function chipStyle(active: boolean): React.CSSProperties {
  return {
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    border: `1px solid ${active ? 'var(--accent-safe)' : 'var(--border-subtle)'}`,
    borderRadius: 'var(--radius-full)',
    padding: '6px 14px',
    background: active ? 'var(--accent-safe-surface)' : 'var(--surface-app)',
    color: active ? 'var(--accent-safe)' : 'var(--text-primary)',
    fontFamily: 'var(--font-family-base)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: (active ? 'var(--font-weight-bold)' : 'var(--font-weight-regular)') as unknown as number,
  }
}

function ReportSessionModal({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [text, setText] = useState('')
  const [aboutIds, setAboutIds] = useState<string[]>([])
  // You can't report yourself — everyone else in the circle (including the facilitator) is reportable.
  const reportable = USERS.filter((p) => p.id !== 'you')

  function toggleAbout(id: string) {
    setAboutIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]))
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} title="Report this session">
      {(close) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 'var(--line-height-base)' }}>
            Tell us what happened. Your report goes to a moderator and stays anonymous — nobody in the circle is notified.
          </p>

          <div>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' as unknown as number, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
              Who is this about? <span style={{ color: 'var(--text-secondary)', fontWeight: 'var(--font-weight-regular)' as unknown as number }}>(select all that apply)</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {reportable.map((p) => (
                <button key={p.id} type="button" onClick={() => toggleAbout(p.id)} style={chipStyle(aboutIds.includes(p.id))}>
                  <UserAvatar user={p} size={20} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <Textarea
            label="What's going on?"
            placeholder="Describe what happened..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <DangerButton
              disabled={!text.trim() || aboutIds.length === 0}
              onClick={() => {
                const about = USERS.filter((p) => aboutIds.includes(p.id))
                  .map((p) => p.label)
                  .join(', ')
                addToast(`Report about ${about} submitted — a moderator will review it.`, { variant: 'safe' })
                setText('')
                setAboutIds([])
                close()
              }}
            >
              Submit report
            </DangerButton>
          </div>
        </div>
      )}
    </Modal>
  )
}

export function DashboardPage() {
  const [sessions, setSessions] = useState<Session[]>(BASE_SESSIONS)
  const [activeId, setActiveId] = useState('w1')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sendMenuOpen, setSendMenuOpen] = useState(false)
  const [guidelinesOpen, setGuidelinesOpen] = useState(true)
  const [reportOpen, setReportOpen] = useState(false)
  const [sentMessages, setSentMessages] = useState<Message[]>([])
  const [turnHolder, setTurnHolder] = useState<string>('you')
  const [secondsLeft, setSecondsLeft] = useState(20)
  const [isTyping, setIsTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const [autoSendOff, setAutoSendOff] = useState(false)
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>()

  const active = sessions.find((s) => s.id === activeId)!
  useDocumentTitle(`${active.name} — MinCirklen`)

  const isGriefLive = active.id === 'w1'
  const sessionIsLive = isGriefLive || !!active.isNew

  const messages: Message[] = isGriefLive
    ? [...GRIEF_MESSAGES, ...sentMessages]
    : active.isNew
      ? sentMessages
      : []

  useEffect(() => {
    if (!isGriefLive || guidelinesOpen) return
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
  }, [turnHolder, isTyping, isGriefLive, guidelinesOpen])

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
      setSentMessages((m) => [...m, { userId: replyingId, text }])
      setTurnHolder('you')
      setSecondsLeft(20)
    }, 3000)
  }

  function sendNow() {
    const text = draft.trim()
    if (!text) return
    setSentMessages((m) => [...m, { userId: 'you', text }])
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
      setSentMessages((m) => [...m, { userId: 'you', text }])
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
  const currentTurnLabel = currentTurnId ? userById(currentTurnId).label : ''
  const isYourTurn = isGriefLive && turnHolder === 'you'
  const turnStatusText = !sessionIsLive
    ? 'Session not active'
    : isYourTurn
      ? "It's your turn"
      : currentTurnLabel
        ? `${currentTurnLabel} is typing···`
        : 'Waiting for the next user'

  const subtitle =
    active.group === 'earlier'
      ? 'Anonymous by default'
      : sessionIsLive
        ? 'Anonymous by default'
        : `Starts ${active.status} · anonymous by default`

  const sidebarHeader = (
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
    </>
  )

  const sidebarList = (
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
  )

  const sidebarContent = (
    <>
      {sidebarHeader}
      {sidebarList}
    </>
  )

  const rightPanelContent = (
    <>
      <div>
        <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)' as unknown as number, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
          Essential pages
        </div>
        {(['how-it-works', 'safety-and-moderation', 'account-and-data'] as const).map((id) => (
          <div key={id}>
            <a
              href={publicPagePath(id)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
              className="ds-inline-link"
              style={{
                display: 'block',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--text-primary)',
                textDecoration: 'none',
                padding: 'var(--space-2) 0',
              }}
            >
              {id === 'safety-and-moderation' ? 'Safety' : PUBLIC_PAGES[id].title}
            </a>
            {id === 'safety-and-moderation' && (
              <a
                href={moderationTransparencyPath()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="ds-inline-link"
                style={{
                  display: 'block',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--text-primary)',
                  textDecoration: 'none',
                  padding: 'var(--space-2) 0',
                }}
              >
                Transparency
              </a>
            )}
          </div>
        ))}
      </div>
      <div style={{ borderTop: '0.5px solid var(--border-subtle)' }} />
      <div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
          If you're in crisis
        </div>
        <a
          href={publicPagePath('crisis-resources')}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setMobileMenuOpen(false)}
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
            textDecoration: 'none',
          }}
        >
          Crisis resources
        </a>
        <button
          type="button"
          onClick={() => {
            setReportOpen(true)
            setMobileMenuOpen(false)
          }}
          style={{
            display: 'block',
            width: '100%',
            background: 'none',
            border: 'none',
            fontFamily: 'var(--font-family-base)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--text-primary)',
            textAlign: 'left',
            padding: 'var(--space-2) 0',
            cursor: 'pointer',
          }}
        >
          Report this session
        </button>
      </div>
    </>
  )

  if (guidelinesOpen) {
    return (
      <div style={{ height: '100%', background: 'var(--surface-app)' }}>
        <CommunityGuidelinesModal isOpen={guidelinesOpen} onAgree={() => setGuidelinesOpen(false)} />
      </div>
    )
  }

  return (
    <div className="dash-root" style={{ display: 'flex', height: '100%', fontFamily: 'var(--font-family-base)', background: 'var(--surface-app)' }}>
      <ReportSessionModal isOpen={reportOpen} onOpenChange={setReportOpen} />

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
        <div className="dash-drawer__header">{sidebarHeader}</div>
        <div className="dash-drawer__list">{sidebarList}</div>
        <div className="dash-drawer__footer">{rightPanelContent}</div>
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
            {USERS.map((p) => (
              <UserAvatar key={p.id} user={p} size={28} ringed={p.id === currentTurnId} />
            ))}
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginLeft: 4 }}>
              {USERS.length} users
            </span>
            <ThemeToggle />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-5) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {messages.length === 0 && (
            <div style={{ margin: 'auto', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', textAlign: 'center', maxWidth: 320 }}>
              {active.group === 'earlier'
                ? 'This session has ended. Transcripts are only visible to users during the live round.'
                : active.isNew
                  ? 'Waiting for the circle to begin.'
                  : 'This circle has not started yet. You will be notified when the round begins.'}
            </div>
          )}
          {messages.map((m, i) => {
            const p = userById(m.userId)
            return (
              <div key={i} style={{ display: 'flex', gap: 10, maxWidth: 560 }}>
                <UserAvatar user={p} size={32} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{p.label}</span>
                  <div
                    style={{
                      background: m.userId === 'you' ? 'var(--accent-safe-surface)' : 'var(--surface-raised)',
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
