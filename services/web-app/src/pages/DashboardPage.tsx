import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Key } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button } from '../components/Button'
import { Avatar } from '../components/Avatar'
import { Checkbox } from '../components/Checkbox'
import { Switch } from '../components/Switch'
import { IconButton } from '../components/IconButton'
import { Modal } from '../components/Modal'
import { Textarea } from '../components/Textarea'
import { TextField } from '../components/TextField'
import { Select, SelectItem } from '../components/Select'
import { Alert } from '../components/Alert'
import { Skeleton } from '../components/Skeleton'
import { Spinner } from '../components/Spinner'
import { addToast } from '../components/Toast'
import { ThemeToggle } from '../ThemeToggle'
import { useTheme } from '../components/ThemeProvider'
import { usePreferences } from '../PreferencesProvider'
import { PUBLIC_PAGES, publicPagePath } from '../publicPages/pages'
import { COUNTRIES } from '../countries'
import { SUPPORTED_LANGUAGES, detectDefaultLanguage, type SupportedLanguage } from '../languages'
import { moderationTransparencyPath, landingPath } from '../App'
import { useDocumentTitle } from '../useDocumentTitle'
import { useScrollShiftCompensation } from '../hooks/useScrollShiftCompensation'
import { logout } from '../logout'
import { StartJoinPage } from './start/StartJoinPage'
import { StartNewPage } from './start/StartNewPage'
import { Tabs, TabList, Tab, TabPanel } from '../components/Tabs'
import {
  type ChatMessage,
  type CrisisResource,
  type RecentVisit,
  type RosterEntry,
  type SessionSummary,
  agreeToGuidelines,
  checkGuidelines,
  getSessionSummary,
  SendMessageConflictError,
  SkipTurnNotYourTurnError,
  skipTurn,
  useRecentVisits,
  useSessionChat,
  useTurnCountdown,
  useWhoAmI,
  visitDisplayName,
  visitSession,
} from './dashboardShared'
import './DashboardPage.css'

// Whether a turn-inactivity countdown reaching zero with a draft present
// auto-sends it, vs. always just auto-skipping (see useTurnCountdown's
// onExpire wiring below) — a per-browser preference, not per-session, so
// it sticks across every circle the same way the theme choice does (see
// ThemeProvider.tsx's identical read/write shape). Defaults to on: that
// matches the behavior before this toggle existed, so nobody's
// experience silently changes just because this shipped.
const AUTO_SEND_STORAGE_KEY = 'mincirklen-auto-send'

function getInitialAutoSend(): boolean {
  if (typeof window === 'undefined') return true
  const stored = window.localStorage.getItem(AUTO_SEND_STORAGE_KEY)
  return stored === null ? true : stored === 'true'
}

// Session pages have their own layout (no SiteHeader) — the account menu
// next to the brand logo in the sidebar is this page's equivalent of
// SiteHeader's "Log out" button. Same shared network call, same hard
// navigation on success; failure surfaces as a toast (not an inline Alert
// like SiteHeader's — a closed dropdown menu has no card/section left to
// put one in).
async function handleLogout(t: (key: string) => string) {
  try {
    await logout()
    window.location.href = landingPath()
  } catch {
    addToast(t('errors.logoutFailed'), { variant: 'urgent' })
  }
}

// Icons + a stable id only — title/description are translated at the
// render site (CommunityGuidelinesModal) via `t(`communityRules.${id}.title`)`.
const COMMUNITY_RULES = [
  { id: 'anonymity', icon: '🔒' },
  { id: 'noAdvertising', icon: '📢' },
  { id: 'noEndorsements', icon: '⚠️' },
  { id: 'supportDontDirect', icon: '🤝' },
  { id: 'reportOrLeave', icon: '🚨' },
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

function CommunityGuidelinesModal({
  isOpen,
  onAgree,
  isAgreeing,
  agreedKeys,
}: {
  isOpen: boolean
  onAgree: () => void
  isAgreeing: boolean
  // Required keys (sessionRepository.ts's CIRCLE_GUIDELINE_AGREEMENT_KEYS)
  // this user has already agreed to, anywhere — pre-checks the matching
  // box(es) instead of showing a blank slate. Most commonly empty (first
  // time ever) or missing just one entry (a checkbox added after this
  // user last agreed).
  agreedKeys: string[]
}) {
  const { t } = useTranslation('dashboard')
  const [step, setStep] = useState(0)
  // Three distinct consents, not one combined checkbox — this is the
  // single gate for every way of joining a circle (direct visit,
  // /start/join, "New session"), so it also covers what those flows' own
  // former step-2 checkboxes used to ask for. Each maps to its own
  // key(s) in CIRCLE_GUIDELINE_AGREEMENT_KEYS (sessionRepository.ts),
  // recorded with its own timestamp — resubmitting an already-agreed key
  // never disturbs its original timestamp (see
  // recordGuidelinesAgreement's merge semantics), so it's safe to always
  // submit all three on "Agree and continue" regardless of which were
  // already pre-checked.
  const [anonymityAcknowledged, setAnonymityAcknowledged] = useState(() => agreedKeys.includes('anonymity_acknowledgement'))
  const [guidelinesAgreed, setGuidelinesAgreed] = useState(
    () => agreedKeys.includes('community_guidelines') && agreedKeys.includes('privacy_policy'),
  )
  const [termsAgreed, setTermsAgreed] = useState(() => agreedKeys.includes('terms_of_service'))
  const agreed = anonymityAcknowledged && guidelinesAgreed && termsAgreed
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
            {t('guidelinesModal.stepOf', { step: step + 1, total: totalSteps })}
          </span>
        </div>

        {!onAgreementStep ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ fontSize: 32 }}>{COMMUNITY_RULES[step].icon}</div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)' as unknown as number, color: 'var(--text-primary)' }}>
              {t(`communityRules.${COMMUNITY_RULES[step].id}.title`)}
            </div>
            <div style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-secondary)', lineHeight: 'var(--line-height-base)' }}>
              {t(`communityRules.${COMMUNITY_RULES[step].id}.description`)}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)' as unknown as number, color: 'var(--text-primary)' }}>
                {t('guidelinesModal.beforeYouJoin')}
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 'var(--line-height-base)' }}>
                {t('guidelinesModal.nonNegotiable')}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <Checkbox isSelected={anonymityAcknowledged} onChange={setAnonymityAcknowledged} />
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                  {t('guidelinesModal.understandAnonymous')}
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <Checkbox isSelected={guidelinesAgreed} onChange={setGuidelinesAgreed} />
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                  {t('guidelinesModal.readAndAgreeToThePrefix')}{' '}
                  <a href={publicPagePath('community-guidelines')} target="_blank" rel="noopener noreferrer" className="ds-inline-link">
                    {t('guidelinesModal.communityGuidelines')}
                  </a>{' '}
                  {t('guidelinesModal.and')}{' '}
                  <a href={publicPagePath('privacy-policy')} target="_blank" rel="noopener noreferrer" className="ds-inline-link">
                    {t('guidelinesModal.privacyPolicy')}
                  </a>
                  .
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <Checkbox isSelected={termsAgreed} onChange={setTermsAgreed} />
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                  {t('guidelinesModal.agreeToThePrefix')}{' '}
                  <a href={publicPagePath('terms-and-conditions')} target="_blank" rel="noopener noreferrer" className="ds-inline-link">
                    {t('guidelinesModal.termsOfService')}
                  </a>{' '}
                  {t('guidelinesModal.liabilityNote')}
                </span>
              </label>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} style={{ visibility: step > 0 ? 'visible' : 'hidden' }}>
            {t('guidelinesModal.back')}
          </Button>
          {!onAgreementStep ? (
            <PrimaryButton onClick={() => setStep((s) => s + 1)}>
              {onLastRule ? t('guidelinesModal.continue') : t('guidelinesModal.next')}
            </PrimaryButton>
          ) : (
            <PrimaryButton disabled={!agreed || isAgreeing} onClick={onAgree}>
              {isAgreeing ? t('guidelinesModal.saving') : t('guidelinesModal.agreeAndContinue')}
            </PrimaryButton>
          )}
        </div>
      </div>
    </Modal>
  )
}

interface Member {
  userId: string
  label: string
  initials: string
  bg: string
}

// Fixed dark text color on every avatar so initials stay readable against any pastel background.
const AVATAR_TEXT = '#2b2b2b'
const AVATAR_COLORS = [
  'oklch(90% 0.06 40)',
  'oklch(90% 0.06 210)',
  'oklch(90% 0.06 300)',
  'oklch(90% 0.06 145)',
  'oklch(90% 0.06 80)',
  'oklch(90% 0.06 260)',
  'oklch(90% 0.06 20)',
]

// Roster members are anonymized by turn position, never by real
// identity — "Member 3", not a name — same anonymity guarantee as the
// rest of the product (Charter §4). `roster` order comes straight from
// the backend's turn_order, so this is stable across a session.
function memberFor(userId: string, roster: RosterEntry[], myUserId: string | null): Member {
  if (userId === myUserId) {
    return { userId, label: 'You', initials: 'Y', bg: 'var(--accent-safe)' }
  }
  const entry = roster.find((r) => r.userId === userId)
  const n = (entry?.turnOrder ?? 0) + 1
  return { userId, label: `Member ${n}`, initials: `M${n}`, bg: AVATAR_COLORS[(entry?.turnOrder ?? 0) % AVATAR_COLORS.length] as string }
}

// `online` is presence (currently connected — see SessionState.onlineUserIds),
// separate from `ringed` (currently holds the turn) — a member can be
// either, both, or neither, so this is a distinct visual signal (a small
// dot), not a variant of the ring.
function MemberAvatar({
  member,
  size = 32,
  ringed = false,
  online = false,
}: {
  member: Member
  size?: number
  ringed?: boolean
  online?: boolean
}) {
  const { t } = useTranslation('dashboard')
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <Avatar
        label={member.label}
        title={online ? t('member.onlineNow', { name: member.label }) : member.label}
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
          background: member.bg,
          color: AVATAR_TEXT,
          boxShadow: ringed ? '0 0 0 2px var(--surface-raised), 0 0 0 4px var(--accent-safe)' : 'none',
        }}
      >
        {member.initials}
      </Avatar>
      {online && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: -1,
            right: -1,
            width: size <= 28 ? 8 : 9,
            height: size <= 28 ? 8 : 9,
            borderRadius: '50%',
            background: 'var(--accent-safe)',
            boxShadow: '0 0 0 2px var(--surface-raised)',
          }}
        />
      )}
    </div>
  )
}

// Matches pages/start/shared.tsx's Chip pattern (pill-style choice control), reused here so
// the "who is this about" picker looks consistent with the rest of the product.
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
  reportable,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  reportable: Member[]
}) {
  const { t } = useTranslation('dashboard')
  const [text, setText] = useState('')
  const [aboutIds, setAboutIds] = useState<string[]>([])

  function toggleAbout(id: string) {
    setAboutIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]))
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} title={t('reportModal.title')}>
      {(close) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 'var(--line-height-base)' }}>
            {t('reportModal.description')}
          </p>

          <div>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' as unknown as number, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
              {t('reportModal.whoIsThisAbout')}{' '}
              <span style={{ color: 'var(--text-secondary)', fontWeight: 'var(--font-weight-regular)' as unknown as number }}>
                {t('reportModal.selectAllThatApply')}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {reportable.length === 0 && (
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{t('reportModal.nobodyElseJoined')}</span>
              )}
              {reportable.map((m) => (
                <button key={m.userId} type="button" onClick={() => toggleAbout(m.userId)} style={chipStyle(aboutIds.includes(m.userId))}>
                  <MemberAvatar member={m} size={20} />
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <Textarea
            label={t('reportModal.whatsGoingOn')}
            placeholder={t('reportModal.describePlaceholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="ghost" onClick={close}>
              {t('reportModal.cancel')}
            </Button>
            <DangerButton
              disabled={!text.trim() || aboutIds.length === 0}
              onClick={() => {
                const about = reportable
                  .filter((m) => aboutIds.includes(m.userId))
                  .map((m) => m.label)
                  .join(', ')
                addToast(t('reportModal.submitted', { about }), { variant: 'safe' })
                setText('')
                setAboutIds([])
                close()
              }}
            >
              {t('reportModal.submit')}
            </DangerButton>
          </div>
        </div>
      )}
    </Modal>
  )
}

function NewSessionModal({ isOpen, onOpenChange, onJoined }: { isOpen: boolean; onOpenChange: (open: boolean) => void; onJoined: (sessionId: string) => void }) {
  const { t } = useTranslation('dashboard')
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} title={t('newSessionModal.title')}>
      <Tabs>
        <TabList aria-label={t('newSessionModal.tabListLabel')}>
          <Tab id="join">{t('newSessionModal.joinTab')}</Tab>
          <Tab id="create">{t('newSessionModal.createTab')}</Tab>
        </TabList>
        <TabPanel id="join">
          <StartJoinPage
            embedded
            onBack={() => onOpenChange(false)}
            onComplete={(sessionId) => {
              onOpenChange(false)
              onJoined(sessionId)
            }}
          />
        </TabPanel>
        <TabPanel id="create">
          <StartNewPage
            embedded
            onBack={() => onOpenChange(false)}
            onComplete={(sessionId) => {
              onOpenChange(false)
              onJoined(sessionId)
            }}
          />
        </TabPanel>
      </Tabs>
    </Modal>
  )
}

type AccountModalSection = 'preferences' | 'profile' | 'settings' | 'privacy'

const SYSTEM_TIMEZONE_KEY = 'system'
const SYSTEM_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone
const SUPPORTED_TIME_ZONES = Intl.supportedValuesOf('timeZone').sort((a, b) => a.localeCompare(b))

// "GMT+1"-style short offset per zone, computed once against today's date
// (not per-render — formatting ~400 zones on every keystroke would be
// wasteful) so the open dropdown can show the hour difference next to
// each name — the raw IANA name alone ("America/New_York") doesn't tell
// a user how far off their day that actually is.
const TIME_ZONE_OFFSETS: Record<string, string> = Object.fromEntries(
  SUPPORTED_TIME_ZONES.map((tz) => [
    tz,
    new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')
      ?.value ?? '',
  ]),
)

// Two-column account modal — a left-hand nav (Preferences / Profile /
// Settings / Privacy & data, plus Log out as a separate exit action rather
// than a section with its own content) and a right-hand panel that swaps
// based on the selected section. Replaces the old "⋯" dropdown menu, which
// only ever held a single "Log out" item.
function AccountModal({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, i18n } = useTranslation('common')
  const { t: dt } = useTranslation('dashboard')
  const [section, setSection] = useState<AccountModalSection>('profile')
  const { theme, toggleTheme } = useTheme()
  const { profile, profileLoading, profileError, refetch } = usePreferences()

  // Draft fields for the editable Profile/Preferences form, seeded from
  // `profile` below. Kept separate from `profile` itself so a half-edited
  // form doesn't affect anything else reading `profile`, and so a failed
  // save leaves the user's in-progress edits in place rather than
  // reverting them.
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editCountry, setEditCountry] = useState<Key | null>(null)
  const [editMobile, setEditMobile] = useState('')
  const [editStayAnonymous, setEditStayAnonymous] = useState(true)
  const [editLanguage, setEditLanguage] = useState<SupportedLanguage>('en')
  const [editTimezone, setEditTimezone] = useState<string | null>(null)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [saveProfileError, setSaveProfileError] = useState<string | null>(null)

  // Reset to the default tab and clear any stale save error every time the
  // modal opens — mirrors the old fetch-driven effect's reset, now that
  // the fetch itself lives one level up in PreferencesProvider.
  useEffect(() => {
    if (!isOpen) return
    setSection('profile')
    setSaveProfileError(null)
  }, [isOpen])

  // Re-seeds the draft fields whenever a freshly (re)loaded profile shows
  // up while the modal is open — on first open once the shared fetch
  // resolves, and again after a save's refetch() — so an abandoned edit
  // never survives a close/reopen, same as the old per-open fetch did.
  useEffect(() => {
    if (!isOpen || !profile) return
    setEditFirstName(profile.firstName)
    setEditLastName(profile.lastName)
    setEditCountry(profile.country)
    setEditMobile(profile.mobileNumber)
    setEditStayAnonymous(profile.stayAnonymous)
    setEditLanguage((profile.language as SupportedLanguage | null) ?? detectDefaultLanguage())
    setEditTimezone(profile.timezone)
  }, [isOpen, profile])

  const canSaveProfile =
    editFirstName.trim() !== '' && editLastName.trim() !== '' && editCountry != null && editMobile.trim() !== ''

  // Reuses auth.completeProfile — it's an upsert keyed on user_id (see
  // userProfileRepository.ts's own doc comment: "resubmitting the
  // registration form... replaces the previous profile rather than
  // erroring"), already designed to double as an edit path, not just the
  // one-time RegisterPage.tsx flow. Deliberately doesn't re-ask for terms
  // agreement here — that's a one-time consent gate at registration, not
  // something routine edits should have to re-clear every time. Shared by
  // both the Profile and Preferences sections' Save buttons: it's a
  // full-replace upsert either way (see userProfileRepository.ts), so
  // saving from either tab sends every current draft field, not just the
  // ones in that tab.
  async function handleSaveProfile() {
    if (!canSaveProfile) return
    setSaveProfileError(null)
    setIsSavingProfile(true)
    try {
      const res = await fetch('/api/trpc/auth.completeProfile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: editFirstName.trim(),
          lastName: editLastName.trim(),
          country: String(editCountry),
          mobileNumber: editMobile.trim(),
          stayAnonymous: editStayAnonymous,
          language: editLanguage,
          timezone: editTimezone,
        }),
      })
      if (!res.ok) throw new Error('error')
      // Applied here too, not just via PreferencesProvider's effect off
      // the refetched profile below — that effect fires after the refetch
      // resolves, which would otherwise show this very toast in the
      // language the user just switched away from.
      if (editLanguage !== i18n.language) await i18n.changeLanguage(editLanguage)
      refetch()
      addToast(t('actions.saved'), { variant: 'safe' })
    } catch {
      setSaveProfileError(t('errors.saveFailed'))
    } finally {
      setIsSavingProfile(false)
    }
  }

  const navItems: { id: AccountModalSection; label: string }[] = [
    { id: 'preferences', label: t('nav.preferences') },
    { id: 'profile', label: t('nav.profile') },
    { id: 'settings', label: t('nav.settings') },
    { id: 'privacy', label: t('nav.privacy') },
  ]

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} title={t('account.title')} className="dash-account-modal">
      <div style={{ display: 'flex', gap: 'var(--space-5)', minHeight: 320 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            width: 160,
            flexShrink: 0,
            borderRight: '0.5px solid var(--border-subtle)',
            paddingRight: 'var(--space-4)',
          }}
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="dash-account-modal__nav-item"
              aria-current={section === item.id}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
          <div style={{ marginTop: 'auto', paddingTop: 'var(--space-3)', borderTop: '0.5px solid var(--border-subtle)' }}>
            <button
              type="button"
              className="dash-account-modal__nav-item dash-account-modal__nav-item--urgent"
              onClick={() => void handleLogout(t)}
            >
              {t('nav.logOut')}
            </button>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {section === 'preferences' && (
            <>
              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)' as unknown as number }}>
                {t('nav.preferences')}
              </div>
              {profileLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Skeleton width="60%" height={14} />
                  <Skeleton width="40%" height={14} />
                </div>
              )}
              {!profileLoading && profileError && <Alert variant="urgent">{profileError}</Alert>}
              {!profileLoading && !profileError && !profile && (
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                  {dt('accountModal.preferencesUnavailable')}
                </div>
              )}
              {!profileLoading && !profileError && profile && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>{dt('accountModal.language')}</div>
                    <Select
                      aria-label={dt('accountModal.language')}
                      selectedKey={editLanguage}
                      onSelectionChange={(key) => setEditLanguage(key as SupportedLanguage)}
                    >
                      {SUPPORTED_LANGUAGES.map((l) => (
                        <SelectItem key={l.code} id={l.code}>
                          {l.nativeName}
                        </SelectItem>
                      ))}
                    </Select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>{dt('accountModal.timezone')}</div>
                    <Select
                      aria-label={dt('accountModal.timezone')}
                      selectedKey={editTimezone ?? SYSTEM_TIMEZONE_KEY}
                      onSelectionChange={(key) => setEditTimezone(key === SYSTEM_TIMEZONE_KEY ? null : String(key))}
                    >
                      <SelectItem id={SYSTEM_TIMEZONE_KEY} textValue={dt('accountModal.systemDefaultShort')}>
                        {dt('accountModal.systemDefault', { zone: SYSTEM_TIME_ZONE, offset: TIME_ZONE_OFFSETS[SYSTEM_TIME_ZONE] ?? '' })}
                      </SelectItem>
                      {SUPPORTED_TIME_ZONES.map((tz) => (
                        <SelectItem key={tz} id={tz} textValue={tz}>
                          {`${tz} (${TIME_ZONE_OFFSETS[tz]})`}
                        </SelectItem>
                      ))}
                    </Select>
                  </div>

                  {saveProfileError && <Alert variant="urgent">{saveProfileError}</Alert>}

                  <Button
                    variant="safe"
                    className="dash-account-modal__save-btn"
                    isPending={isSavingProfile}
                    isDisabled={!canSaveProfile}
                    onPress={() => void handleSaveProfile()}
                    style={{ alignSelf: 'flex-end', marginTop: 'var(--space-2)' }}
                  >
                    {t('actions.saveChanges')}
                  </Button>
                </div>
              )}
            </>
          )}
          {section === 'profile' && (
            <>
              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)' as unknown as number }}>
                {dt('accountModal.profile')}
              </div>
              {profileLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Skeleton width="60%" height={14} />
                  <Skeleton width="40%" height={14} />
                  <Skeleton width="50%" height={14} />
                </div>
              )}
              {!profileLoading && profileError && <Alert variant="urgent">{profileError}</Alert>}
              {!profileLoading && !profileError && !profile && (
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{dt('accountModal.profileUnavailable')}</div>
              )}
              {!profileLoading && !profileError && profile && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ flex: '1 1 140px' }}>
                      <TextField
                        className="dash-account-modal__field"
                        label={dt('accountModal.firstName')}
                        value={editFirstName}
                        onChange={(e) => setEditFirstName(e.target.value)}
                        autoComplete="given-name"
                      />
                    </div>
                    <div style={{ flex: '1 1 140px' }}>
                      <TextField
                        className="dash-account-modal__field"
                        label={dt('accountModal.lastName')}
                        value={editLastName}
                        onChange={(e) => setEditLastName(e.target.value)}
                        autoComplete="family-name"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ flex: '1 1 140px' }}>
                      <Select
                        className="dash-account-modal__field"
                        label={dt('accountModal.country')}
                        placeholder={dt('accountModal.countryPlaceholder')}
                        selectedKey={editCountry}
                        onSelectionChange={setEditCountry}
                      >
                        {COUNTRIES.map((c) => (
                          <SelectItem key={c.code} id={c.code}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </Select>
                    </div>
                    <div style={{ flex: '1 1 140px' }}>
                      <TextField
                        className="dash-account-modal__field"
                        label={dt('accountModal.mobileNumber')}
                        type="tel"
                        value={editMobile}
                        onChange={(e) => setEditMobile(e.target.value)}
                        autoComplete="tel"
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: -8 }}>
                    {dt('accountModal.mobileHint')}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                    <div>
                      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>{dt('accountModal.stayAnonymous')}</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{dt('accountModal.stayAnonymousHint')}</div>
                    </div>
                    <Switch isSelected={editStayAnonymous} onChange={setEditStayAnonymous} />
                  </div>

                  {saveProfileError && <Alert variant="urgent">{saveProfileError}</Alert>}

                  <Button
                    variant="safe"
                    className="dash-account-modal__save-btn"
                    isPending={isSavingProfile}
                    isDisabled={!canSaveProfile}
                    onPress={() => void handleSaveProfile()}
                    style={{ alignSelf: 'flex-end', marginTop: 'var(--space-2)' }}
                  >
                    {t('actions.saveChanges')}
                  </Button>
                </div>
              )}
            </>
          )}
          {section === 'settings' && (
            <>
              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)' as unknown as number }}>
                {dt('accountModal.settings')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                <div>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>{dt('accountModal.appearance')}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{dt('accountModal.appearanceHint')}</div>
                </div>
                <Switch isSelected={theme === 'dark'} onChange={toggleTheme} />
              </div>
            </>
          )}
          {section === 'privacy' && (
            <>
              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)' as unknown as number }}>
                {t('nav.privacy')}
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', lineHeight: 'var(--line-height-base)' }}>
                {dt('accountModal.privacyNote')}
              </div>
              <a
                href={publicPagePath('privacy-policy')}
                target="_blank"
                rel="noopener noreferrer"
                className="ds-inline-link"
                style={{ fontSize: 'var(--font-size-sm)' }}
              >
                {dt('accountModal.readFullPrivacyPolicy')}
              </a>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

function formatScheduledAt(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone })
}

// yyyy-mm-dd in the given zone, for a same-day comparison that's actually
// correct in that zone — comparing local Date getters (getFullYear/
// getMonth/getDate) would silently use the browser's own zone instead
// whenever `timeZone` is an explicit preference that differs from it.
function dateKeyInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

// Time-only for a message sent earlier today (the common case in a live
// round) — the date would just be visual noise. Anything older (a
// transcript revisited on a later day) gets the date too, since "3:45 PM"
// alone stops being unambiguous once it's not today.
function formatMessageTimestamp(iso: string, timeZone: string): string {
  const sent = new Date(iso)
  const now = new Date()
  const isToday = dateKeyInZone(sent, timeZone) === dateKeyInZone(now, timeZone)
  const time = sent.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone })
  if (isToday) return time
  const date = sent.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone })
  return `${date}, ${time}`
}

function statusSubtitle(summary: SessionSummary, timeZone: string, t: TFunction<'dashboard'>): string {
  if (summary.status === 'completed' || summary.status === 'cancelled') return t('status.ended')
  if (summary.status === 'active') return t('status.anonymousByDefault')
  if (summary.scheduledAt) return t('status.startsAt', { time: formatScheduledAt(summary.scheduledAt, timeZone) })
  return t('status.anonymousByDefault')
}

function emptyStateText(summary: SessionSummary, t: TFunction<'dashboard'>): string {
  if (summary.status === 'completed' || summary.status === 'cancelled') {
    return t('emptyState.ended')
  }
  if (summary.status === 'forming') {
    return t('emptyState.forming')
  }
  return t('emptyState.waitingForFirstMessage')
}

function DashboardSidebarSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} style={{ padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Skeleton width="70%" height={13} />
          <Skeleton width="45%" height={11} />
        </div>
      ))}
    </div>
  )
}

function RecentVisitsList({
  visits,
  activeId,
  search,
  onSelect,
}: {
  visits: RecentVisit[]
  activeId: string
  search: string
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation('dashboard')
  const trimmed = search.trim()
  const { effectiveTimeZone } = usePreferences()
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const prevRectsRef = useRef(new Map<string, DOMRect>())

  // FLIP: when a session switch (or a search edit) reorders this list —
  // most visibly, the just-visited session jumping to the top — slide
  // each row from its previous position to its new one instead of
  // letting the whole list just snap. Rows with no previous position
  // (first mount, or newly appearing under a search) aren't animated.
  useLayoutEffect(() => {
    const prevRects = prevRectsRef.current
    const nextRects = new Map<string, DOMRect>()
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    rowRefs.current.forEach((el, id) => {
      const rect = el.getBoundingClientRect()
      nextRects.set(id, rect)
      if (reduceMotion) return
      const prev = prevRects.get(id)
      if (!prev) return
      const deltaY = prev.top - rect.top
      if (Math.abs(deltaY) < 1) return
      el.animate([{ transform: `translateY(${deltaY}px)` }, { transform: 'none' }], {
        duration: 360,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
      })
    })

    prevRectsRef.current = nextRects
  }, [visits])

  return (
    <>
      {visits.map((v) => {
        const name = visitDisplayName(v)
        const trimmedLower = trimmed.toLowerCase()
        const index = trimmed ? name.toLowerCase().indexOf(trimmedLower) : -1
        return (
          <div
            key={v.id}
            ref={(el) => {
              if (el) rowRefs.current.set(v.id, el)
              else rowRefs.current.delete(v.id)
            }}
            onClick={() => onSelect(v.id)}
            style={{
              cursor: 'pointer',
              padding: 'var(--space-2)',
              borderRadius: 'var(--radius-md)',
              background: v.id === activeId ? 'var(--accent-safe-surface)' : 'transparent',
            }}
          >
            <div
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: (v.id === activeId ? 'var(--font-weight-bold)' : 'var(--font-weight-regular)') as unknown as number,
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {index === -1 ? (
                name
              ) : (
                <>
                  {name.slice(0, index)}
                  <span style={{ background: 'var(--accent-safe-surface)', color: 'var(--accent-safe)', borderRadius: 3 }}>
                    {name.slice(index, index + trimmed.length)}
                  </span>
                  {name.slice(index + trimmed.length)}
                </>
              )}
            </div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
              {v.status === 'active'
                ? t('sidebar.liveNow')
                : v.scheduledAt
                  ? formatScheduledAt(v.scheduledAt, effectiveTimeZone)
                  : v.status === 'completed'
                    ? t('sidebar.ended')
                    : t('sidebar.notStarted')}
            </div>
          </div>
        )
      })}
    </>
  )
}

// A near-instant, no-animation jump to the newest message when a
// session's chat first has data to show (covers both the initial load
// of an existing conversation and switching into an empty one) —
// distinct from the smooth scroll used for a live incoming message,
// which reads as an update rather than a fresh page.
const NEAR_BOTTOM_THRESHOLD_PX = 48

function isNearBottom(el: HTMLElement, threshold = NEAR_BOTTOM_THRESHOLD_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
}

// Keeps rendering its content for `exitDurationMs` after `show` flips
// false, so a caller can drive a CSS opacity transition to a real close
// (fade out, then unmount) instead of the element just vanishing.
function useDelayedUnmount(show: boolean, exitDurationMs: number): boolean {
  const [mounted, setMounted] = useState(show)
  useEffect(() => {
    if (show) {
      setMounted(true)
      return
    }
    const timer = setTimeout(() => setMounted(false), exitDurationMs)
    return () => clearTimeout(timer)
  }, [show, exitDurationMs])
  return mounted
}

// A calm, centered waiting card over a blurred backdrop — replaces a
// literal loading skeleton (which read as an abrupt, "snappy" content
// swap) for the brief join/guidelines-check gate on every session
// switch. Fades in on mount and, via the caller's useDelayedUnmount,
// fades out to reveal the real content underneath rather than cutting.
function CenterPanelLoadingOverlay({ exiting }: { exiting: boolean }) {
  return (
    <div className={['dash-loading-overlay', exiting && 'dash-loading-overlay--exiting'].filter(Boolean).join(' ')}>
      <div className="dash-loading-overlay__card">
        <Spinner size={26} />
      </div>
    </div>
  )
}

// Inline stand-in for ErrorPage, scoped to just the center panel — the
// sidebar (and the rest of the shell) stays visible and usable even
// when the currently-selected session can't load, since a session
// switch never remounts the shell any more.
function CenterPanelMessage({ code, title, message }: { code?: number; title: string; message: string }) {
  const { t } = useTranslation('dashboard')
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)' }}>
      <div style={{ maxWidth: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {code !== undefined && (
          <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)' as unknown as number, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
            {t('centerPanelError.errorCode', { code })}
          </div>
        )}
        <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)' as unknown as number, color: 'var(--text-primary)' }}>{title}</div>
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{message}</div>
      </div>
    </div>
  )
}

// checking: existence check in flight (read-only — session.getSummary).
// joining: existence confirmed; actually joining + recording the visit
//   (session.visit). The community-guidelines agreement lives on this
//   session's own session_users row (migrations/0013), so joining has to
//   happen before the row exists to check/record agreement against it.
// checking-guidelines: join succeeded; checking (and syncing onto this
//   row) which required keys this user has already agreed to anywhere —
//   session.checkGuidelines.
// needs-agreement / agreeing: not every required key is covered yet —
//   see CommunityGuidelinesModal, which pre-checks whatever's in
//   `agreedKeys` (e.g. a user who agreed before a new checkbox was added
//   sees everything but that one already checked) and leaves the rest
//   for the user to actually check. Recording it (agreeing) writes onto
//   this same already-joined row — see recordGuidelinesAgreement's
//   merge semantics for why already-agreed keys' original timestamps
//   are never disturbed by resubmitting the full set.
// ready: every required key covered (whether just now or via sync).
// error: not_found (getSummary or, defensively, visit's own re-check),
//   full (visit — a capacity race after existence was confirmed), or a
//   generic error.
type DashboardLoadState =
  | { status: 'checking' }
  | { status: 'joining' }
  | { status: 'checking-guidelines'; summary: SessionSummary }
  | { status: 'needs-agreement'; summary: SessionSummary; agreedKeys: string[] }
  | { status: 'agreeing'; summary: SessionSummary; agreedKeys: string[] }
  | { status: 'ready'; summary: SessionSummary }
  | { status: 'error'; kind: 'not_found' | 'full' | 'error' }

// Everything below the shell that changes with the selected session: the
// join/guidelines state machine, the live chat (messages/roster/turn),
// the composer, and scroll tracking. Deliberately NOT remounted per
// session (no key= at its call site) — staying mounted across a switch
// is what lets it keep showing the previous session's chat, blurred
// under the loading overlay, until the new one is actually ready; see
// the swap-detection in the scroll-tracking effect below for how it
// resets per-session bits (draft, scroll position) without a remount.
function SessionCenterPanel({
  sessionId,
  mobileMenuOpen,
  onToggleMobileMenu,
  onReportableChange,
  onVisited,
}: {
  sessionId: string
  mobileMenuOpen: boolean
  onToggleMobileMenu: () => void
  onReportableChange: (reportable: Member[]) => void
  onVisited: () => void
}) {
  const { t } = useTranslation('dashboard')
  const [loadState, setLoadState] = useState<DashboardLoadState>({ status: 'checking' })
  const { userId: myUserId } = useWhoAmI()
  const { effectiveTimeZone } = usePreferences()

  // Existence check — read-only, no join side effect. Re-runs on every
  // sessionId change (no remount to reset `loadState` for us), so it
  // explicitly resets to 'checking' itself first.
  useEffect(() => {
    let cancelled = false
    setLoadState({ status: 'checking' })
    void (async () => {
      try {
        await getSessionSummary(sessionId)
        if (!cancelled) setLoadState({ status: 'joining' })
      } catch (err) {
        if (cancelled) return
        const kind = err instanceof Error && err.message === 'not_found' ? 'not_found' : 'error'
        setLoadState({ status: 'error', kind })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  // Joins + records the visit — the session_users row the
  // guidelines-agreement check right below needs to already exist.
  useEffect(() => {
    if (loadState.status !== 'joining') return
    let cancelled = false
    void (async () => {
      try {
        const summary = await visitSession(sessionId)
        if (!cancelled) {
          setLoadState({ status: 'checking-guidelines', summary })
          // Only now has the backend actually bumped this session's
          // last_visited_at — telling the shell to refresh its sidebar
          // list any earlier (e.g. right on sessionId change) would race
          // ahead of this and capture a stale sort order.
          onVisited()
        }
      } catch (err) {
        if (cancelled) return
        const kind = err instanceof Error && (err.message === 'not_found' || err.message === 'full') ? err.message : 'error'
        setLoadState({ status: 'error', kind: kind as 'not_found' | 'full' | 'error' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadState.status, sessionId, onVisited])

  // Checks which required keys this user has already agreed to
  // anywhere (this session or another) and syncs them onto this
  // session's row.
  useEffect(() => {
    if (loadState.status !== 'checking-guidelines') return
    const { summary } = loadState
    let cancelled = false
    void (async () => {
      try {
        const { agreed, agreedKeys } = await checkGuidelines(sessionId)
        if (cancelled) return
        setLoadState(agreed ? { status: 'ready', summary } : { status: 'needs-agreement', summary, agreedKeys })
      } catch {
        if (!cancelled) setLoadState({ status: 'error', kind: 'error' })
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `summary` comes from `loadState` via the guard above, not a separate dep; only the status transition should retrigger this
  }, [loadState.status, sessionId])

  async function handleAgree() {
    if (loadState.status !== 'needs-agreement') return
    const { summary, agreedKeys } = loadState
    setLoadState({ status: 'agreeing', summary, agreedKeys })
    try {
      await agreeToGuidelines(sessionId)
      setLoadState({ status: 'ready', summary })
    } catch {
      addToast(t('errors.agreementFailed'), { variant: 'urgent' })
      setLoadState({ status: 'needs-agreement', summary, agreedKeys })
    }
  }

  const isReady = loadState.status === 'ready'

  // Gated on isReady — getState/listMessages are membership-gated, and
  // this component reaches DOM well before the join/guidelines gate
  // resolves, so polling has to wait or it'd just 403 on every tick.
  // Note this hook keeps returning whatever it last fetched until a new
  // fetch actually resolves — it doesn't clear `state`/`messages` just
  // because `sessionId` changed. That's what lets a session switch keep
  // showing the previous session's chat (see `displayedSummary` below)
  // instead of a gap.
  const {
    state: sessionState,
    messages,
    error: chatError,
    send,
    lastJoinedEvent,
    loadOlderMessages,
    hasOlderMessages,
    loadingOlderMessages,
    messagesTopShiftVersion,
  } = useSessionChat(sessionId, isReady)

  // Whether the chat data currently held above actually belongs to this
  // panel's target `sessionId`, vs. still being the previous session's
  // (stale) data left over from before a switch.
  const chatMatchesTarget = sessionState?.id === sessionId

  // The summary actually shown in the header/empty-state — only ever
  // advances to the new session once ITS chat data has caught up too,
  // so the header and the messages below it never show two different
  // sessions at once. Starts null (nothing to show) only on the very
  // first load; a session switch keeps the previous value until ready.
  const [displayedSummary, setDisplayedSummary] = useState<SessionSummary | null>(null)
  useEffect(() => {
    if (loadState.status === 'ready' && chatMatchesTarget) setDisplayedSummary(loadState.summary)
  }, [loadState, chatMatchesTarget])

  useDocumentTitle(displayedSummary ? `${visitDisplayName(displayedSummary)} — MinCirklen` : 'MinCirklen')

  const [draft, setDraft] = useState('')
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null)
  // Auto-grow the composer to fit its content, like other chat apps —
  // capped by CSS's max-height (.dash-composer-textarea, 4 lines), which
  // takes over as an internal scroll once content exceeds it rather than
  // growing the box any further. Reset to 'auto' first so shrinking (e.g.
  // the draft clearing after a send) actually shrinks the box back down
  // instead of scrollHeight only ever remembering its tallest value.
  useEffect(() => {
    const el = composerTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])
  const [isSending, setIsSending] = useState(false)
  const [crisisResource, setCrisisResource] = useState<CrisisResource | null>(null)
  const [offlinePanelOpen, setOfflinePanelOpen] = useState(false)
  const offlinePanelRef = useRef<HTMLDivElement>(null)
  const [autoSendEnabled, setAutoSendEnabledState] = useState(getInitialAutoSend)
  const [sendMenuOpen, setSendMenuOpen] = useState(false)

  function setAutoSendEnabled(next: boolean) {
    window.localStorage.setItem(AUTO_SEND_STORAGE_KEY, String(next))
    setAutoSendEnabledState(next)
  }

  const roster = sessionState?.roster ?? []
  const isYourTurn = sessionState?.currentTurnUserId !== null && sessionState?.currentTurnUserId === myUserId
  const members = roster.map((r) => memberFor(r.userId, roster, myUserId))

  // Split the roster into who's actually here right now vs. who has
  // ever been here — the header row only ever shows the former, so it
  // reads as "who's in the room" rather than a growing list of everyone
  // who's ever passed through. A past participant only qualifies for the
  // "offline" list if they actually said something — someone who joined
  // and immediately left without a word was never really part of the
  // conversation, and surfacing them just adds noise (this also quietly
  // keeps stray test/ghost joins out of the list).
  const onlineUserIds = sessionState?.onlineUserIds ?? []
  const messagedUserIds = new Set(messages.map((m) => m.userId))
  const onlineMembers = members.filter((m) => onlineUserIds.includes(m.userId))
  const offlineMembers = members.filter((m) => !onlineUserIds.includes(m.userId) && messagedUserIds.has(m.userId))

  useEffect(() => {
    if (!offlinePanelOpen) return
    function handlePointerDown(e: PointerEvent) {
      if (offlinePanelRef.current && !offlinePanelRef.current.contains(e.target as Node)) {
        setOfflinePanelOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [offlinePanelOpen])

  // Live join notification — websocket-service pushes this the moment
  // someone else joins (see internalController.ts's createJoinTurnHandler);
  // the roster/avatar count above already updates from the accompanying
  // (separately-arriving) roster-update frame, this is just the toast.
  // Labeled from the event's own turnOrder, not a lookup into `roster` —
  // that array may not have caught up to this same join yet, since the
  // two frames are independent WS messages with no ordering guarantee
  // between them. Never fires for the current user's own join: this hook
  // isn't even connected yet at that point (enabled only once this
  // session's own join+guidelines gate has already resolved).
  useEffect(() => {
    if (!lastJoinedEvent) return
    const label = memberFor(
      lastJoinedEvent.userId,
      [{ userId: lastJoinedEvent.userId, turnOrder: lastJoinedEvent.turnOrder }],
      myUserId,
    ).label
    addToast(`${label} joined the circle`, { variant: 'safe' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new join event should re-fire this; myUserId is read live, not tracked as a dep
  }, [lastJoinedEvent])

  // Lifts the reportable roster up to the shell, which owns
  // ReportSessionModal — it needs to live at the shell level regardless,
  // since it should stay open (reporting the same session) even if the
  // sidebar's search or other shell state changes underneath it.
  useEffect(() => {
    onReportableChange(members.filter((m) => m.userId !== myUserId))
    return () => onReportableChange([])
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the roster/identity should retrigger this, not onReportableChange's identity
  }, [sessionState?.roster, myUserId])

  const turnStatusText = !sessionState
    ? ''
    : sessionState.status !== 'active'
      ? t('composer.sessionNotActive')
      : isYourTurn
        ? t('composer.itsYourTurn')
        : sessionState.currentTurnUserId
          ? t('composer.hasTheFloor', { name: memberFor(sessionState.currentTurnUserId, roster, myUserId).label })
          : t('composer.waitingForNextUser')

  async function sendNow() {
    const text = draft.trim()
    // The input itself is never turn-gated (composing ahead is always
    // allowed — see the input's own comment), so this has to guard
    // itself: pressing Enter while it isn't your turn yet must silently
    // no-op, not fire a doomed request that'd just 403 and surface a
    // confusing "something went wrong" toast for something the user
    // never actually did wrong.
    if (!text || !isYourTurn) return
    setIsSending(true)
    try {
      const outcome = await send(text)
      setDraft('')
      if (outcome.status === 'held') {
        addToast(t('errors.messageHeld'), { variant: 'urgent' })
      } else if (outcome.status === 'crisis') {
        setCrisisResource(outcome.resource)
      } else {
        setCrisisResource(null)
      }
    } catch (err) {
      // The same account open in more than one tab/window each runs its
      // own local auto-send countdown — if two race to claim/send the
      // same turn, the loser gets this back. Not a failure worth
      // alarming the user about; the turn already moved on exactly as
      // intended via whichever tab won (mirrors autoSkipTurn's identical
      // handling of its own equivalent race).
      if (!(err instanceof SendMessageConflictError)) {
        addToast(t('errors.sendFailed'), { variant: 'urgent' })
      }
    } finally {
      setIsSending(false)
    }
  }

  async function autoSkipTurn() {
    try {
      await skipTurn(sessionId)
      addToast(t('errors.turnSkipped'), { variant: 'info' })
    } catch (err) {
      // The same account open in more than one tab/window each runs its
      // own local countdown — if both race to skip the same turn, the
      // loser correctly gets rejected here. That's not a failure worth
      // alarming the user about; the turn already moved on exactly as
      // intended via the tab that won.
      if (err instanceof SkipTurnNotYourTurnError) return
      addToast(t('errors.skipFailed'), { variant: 'urgent' })
    }
  }

  // Only armed once the session is actually usable (isReady) and it's
  // genuinely this viewer's turn — matches the same guard the composer's
  // own `disabled` prop already uses, so the countdown can never appear
  // for a turn the input itself wouldn't let you act on.
  const turnSecondsLeft = useTurnCountdown(isReady && isYourTurn, draft, () => {
    // With auto-send off, a drafted-but-unsent message never gets
    // force-submitted on your behalf — running out of time always just
    // costs you the turn instead, same as if you'd left it empty.
    if (draft.trim() && autoSendEnabled) {
      void sendNow()
    } else {
      void autoSkipTurn()
    }
  })

  // Scroll tracking: jump to the newest message the first time this
  // session actually has any to show (covers both "load an existing
  // conversation" and "watch an empty one get its first message"),
  // auto-follow smoothly while the user is at/near the bottom, and
  // otherwise leave their scroll position alone and surface a
  // click-to-jump indicator instead.
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const prevMessageCountRef = useRef<number | null>(null)
  const initialScrollDoneRef = useRef(false)
  const [newMessageCount, setNewMessageCount] = useState(0)
  // Tracks the last messagesTopShiftVersion this effect has already
  // accounted for — a loadOlderMessages prepend also grows messages.length,
  // but it must never be mistaken for "new messages arrived" (which would
  // wrongly auto-scroll-to-bottom or show the jump-to-bottom pill for
  // messages that are actually older, not new). See the check at the top
  // of the "same session" branch below.
  const prevTopShiftVersionRef = useRef(messagesTopShiftVersion)

  // Tracks which session's data `messages` last belonged to — this
  // panel no longer remounts on a session switch (that's what lets it
  // keep showing the previous session blurred underneath the loading
  // overlay), so this effect has to notice the handoff itself instead
  // of getting a clean slate for free.
  const lastMessagesSessionIdRef = useRef<string | null>(null)

  // Plain scrollTop assignment, not scrollTo({ behavior: 'smooth' }) —
  // smooth-behavior scrollTo silently no-ops in some automated/headless
  // Chrome contexts (verified live), and an instant jump reads fine for
  // a chat catching up on new messages. Returns whether it actually acted
  // (the ref was attached) — callers use this to decide whether it's safe
  // to mark the scroll as done, or whether they need to retry once the
  // container actually exists (see the effect below's displayedSummary
  // comment for why the ref can still be null on this call).
  function scrollToBottom(): boolean {
    const el = messagesContainerRef.current
    if (!el) return false
    el.scrollTop = el.scrollHeight
    return true
  }

  function handleScroll() {
    const el = messagesContainerRef.current
    if (!el) return
    const atBottom = isNearBottom(el)
    isAtBottomRef.current = atBottom
    if (atBottom) setNewMessageCount(0)
  }

  function jumpToBottom() {
    scrollToBottom()
    setNewMessageCount(0)
  }

  useEffect(() => {
    const currentSessionId = sessionState?.id ?? null
    if (currentSessionId !== lastMessagesSessionIdRef.current) {
      lastMessagesSessionIdRef.current = currentSessionId
      // A different session's data just landed (or this is the very
      // first load) — treat it as a fresh conversation for scroll
      // purposes: jump straight to the bottom, don't count any of it
      // as "new" messages to flag, and reset the composer draft, which
      // belongs to whichever session it was typed in.
      prevMessageCountRef.current = messages.length
      // Only markable "done" once scrollToBottom actually had a ref to
      // act on — messagesContainerRef's div can still be unmounted at
      // this exact point (see the displayedSummary dependency's comment
      // below), and marking this true regardless would permanently skip
      // the retry once the div does mount, since prevMessageCountRef
      // above already absorbed this message count either way.
      initialScrollDoneRef.current = messages.length > 0 && scrollToBottom()
      isAtBottomRef.current = true
      setNewMessageCount(0)
      setDraft('')
      setIsSending(false)
      setCrisisResource(null)
      return
    }

    if (messagesTopShiftVersion !== prevTopShiftVersionRef.current) {
      // A loadOlderMessages prepend, not a new/live message — resync the
      // length baseline so its delta never reads as "N new messages" on
      // the next real change, and never touch isAtBottomRef/
      // newMessageCount/auto-scroll for it. Scroll position itself is
      // handled separately by useScrollShiftCompensation.
      prevTopShiftVersionRef.current = messagesTopShiftVersion
      prevMessageCountRef.current = messages.length
      return
    }

    const prevCount = prevMessageCountRef.current
    prevMessageCountRef.current = messages.length

    if (!initialScrollDoneRef.current) {
      if (messages.length > 0) {
        initialScrollDoneRef.current = scrollToBottom()
      }
      return
    }

    if (prevCount === null) return
    const added = messages.length - prevCount
    if (added <= 0) return

    if (isAtBottomRef.current) {
      scrollToBottom()
    } else {
      setNewMessageCount((n) => n + added)
    }
    // displayedSummary is a dependency too, not just messages: it gates
    // whether this panel's JSX (and therefore messagesContainerRef's div)
    // is mounted at all, and it flips null -> non-null one render *after*
    // messages first populates (its own setter lives in a separate
    // effect) — so on a fresh load, messages changes on a render where
    // the ref is still null (a no-op scrollToBottom), and by the time the
    // div actually mounts, messages hasn't changed again to re-trigger
    // this effect. Depending on displayedSummary too re-fires this effect
    // on that exact transition, guaranteeing at least one firing sees a
    // real ref.
  }, [messages, displayedSummary, messagesTopShiftVersion])

  // Scroll-up-for-older-messages pagination — same fundamental technique
  // as pages/start/shared.tsx's windowed browse list (a sentinel watched
  // by an IntersectionObserver rooted at the scroll container, plus
  // scroll-position compensation so the prepend doesn't visibly jump the
  // view), via the shared useScrollShiftCompensation hook. Unidirectional
  // (top only): new messages arrive live at the bottom over the
  // WebSocket, never via pagination — see useSessionChat's own doc
  // comment.
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const { snapshotBeforeShift } = useScrollShiftCompensation(messagesContainerRef, messagesTopShiftVersion)

  function handleLoadOlderMessages() {
    snapshotBeforeShift()
    void loadOlderMessages()
  }

  useEffect(() => {
    const root = messagesContainerRef.current
    const sentinel = topSentinelRef.current
    if (!root || !sentinel || !hasOlderMessages) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) handleLoadOlderMessages()
      },
      { root, rootMargin: '80px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleLoadOlderMessages reads live refs/callbacks, doesn't need to be a dependency. displayedSummary is included for the same reason as the scroll-tracking effect above: it gates whether this panel's JSX (and therefore both refs) is mounted at all, and can flip true one render after hasOlderMessages/messages.length already did — without it, this effect can fire once with both refs still null and never get another chance to attach the observer.
  }, [hasOlderMessages, messages.length, displayedSummary])

  // The join/guidelines-check gate on every session switch used to swap
  // the whole panel for a literal loading skeleton, which read as an
  // abrupt, "snappy" content change. Instead this only ever shows a
  // calm waiting overlay on top of the panel — kept mounted a little
  // past the gate closing (useDelayedUnmount) so it fades out and
  // reveals whatever loaded underneath, rather than cutting away. Stays
  // open through `ready` until the chat data catches up too
  // (chatMatchesTarget), so a session switch blurs the previous
  // session's still-visible chat instead of a blank panel.
  const isLoadingGate =
    loadState.status === 'checking' ||
    loadState.status === 'joining' ||
    loadState.status === 'checking-guidelines' ||
    (loadState.status === 'ready' && !chatMatchesTarget)
  const showLoadingOverlay = useDelayedUnmount(isLoadingGate, 260)

  let content: React.ReactNode = null
  if (loadState.status === 'error') {
    if (loadState.kind === 'not_found') {
      content = <CenterPanelMessage code={404} title={t('centerPanelError.notFoundTitle')} message={t('centerPanelError.notFoundMessage')} />
    } else if (loadState.kind === 'full') {
      content = <CenterPanelMessage code={409} title={t('centerPanelError.fullTitle')} message={t('centerPanelError.fullMessage')} />
    } else {
      content = <CenterPanelMessage code={500} title={t('centerPanelError.genericTitle')} message={t('centerPanelError.genericMessage')} />
    }
  } else if (loadState.status === 'needs-agreement' || loadState.status === 'agreeing') {
    content = (
      <CommunityGuidelinesModal
        isOpen
        onAgree={() => void handleAgree()}
        isAgreeing={loadState.status === 'agreeing'}
        agreedKeys={loadState.agreedKeys}
      />
    )
  } else if (displayedSummary) {
    const summary = displayedSummary
    content = (
      <>
        <div
          className="dash-panel-header"
          style={{
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
              onClick={onToggleMobileMenu}
              aria-expanded={mobileMenuOpen}
              aria-label={t('panel.toggleMenu')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
            <div>
              <div style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)' as unknown as number, color: 'var(--text-primary)' }}>
                {visitDisplayName(summary)}
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 2 }}>
                {statusSubtitle(summary, effectiveTimeZone, t)}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {onlineMembers.map((m) => (
              <MemberAvatar key={m.userId} member={m} size={28} ringed={m.userId === sessionState?.currentTurnUserId} online />
            ))}
            {offlineMembers.length > 0 && (
              <div ref={offlinePanelRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  aria-label={t('panel.showOfflineParticipants', { count: offlineMembers.length })}
                  aria-expanded={offlinePanelOpen}
                  onClick={() => setOfflinePanelOpen((v) => !v)}
                  style={{
                    width: 28,
                    height: 28,
                    flex: 'none',
                    borderRadius: '50%',
                    border: '1px dashed var(--border-strong)',
                    background: offlinePanelOpen ? 'var(--surface-sunken)' : 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: 10,
                    fontWeight: 'var(--font-weight-bold)' as unknown as number,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  +{offlineMembers.length}
                </button>
                {offlinePanelOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
                      zIndex: 20,
                      width: 200,
                      boxSizing: 'border-box',
                      background: 'var(--surface-raised)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 8,
                      padding: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      boxShadow: 'var(--shadow-md)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--text-secondary)',
                        fontWeight: 'var(--font-weight-medium)' as unknown as number,
                        padding: '2px 6px 6px',
                      }}
                    >
                      {t('panel.notCurrentlyOnline')}
                    </div>
                    {offlineMembers.map((m) => (
                      <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px' }}>
                        <MemberAvatar member={m} size={24} />
                        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>{m.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginLeft: 4 }}>
              {t('panel.userCount', { count: onlineMembers.length })}
            </span>
            <ThemeToggle />
          </div>
        </div>

        <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="dash-messages"
            style={{
              position: 'absolute',
              inset: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
            }}
          >
            {chatError && <Alert variant="urgent">{chatError}</Alert>}
            {!chatError && messages.length === 0 && (
              <div style={{ margin: 'auto', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', textAlign: 'center', maxWidth: 320 }}>
                {emptyStateText(summary, t)}
              </div>
            )}
            {hasOlderMessages && <div ref={topSentinelRef} style={{ height: 1, flexShrink: 0 }} />}
            {loadingOlderMessages && (
              <div style={{ display: 'flex', gap: 10, maxWidth: 560 }}>
                <Skeleton width={32} height={32} radius="var(--radius-full)" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <Skeleton width={72} height={12} />
                  <Skeleton width="80%" height={40} radius="var(--radius-md)" />
                </div>
              </div>
            )}
            {messages.map((m: ChatMessage) => {
              const member = memberFor(m.userId, roster, myUserId)
              return (
                <div key={m.id} style={{ display: 'flex', gap: 10, maxWidth: 560 }}>
                  <MemberAvatar member={member} size={32} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{member.label}</span>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', opacity: 0.7 }}>
                        {formatMessageTimestamp(m.createdAt, effectiveTimeZone)}
                      </span>
                    </span>
                    <div
                      style={{
                        background: m.userId === myUserId ? 'var(--accent-safe-surface)' : 'var(--surface-raised)',
                        border: '0.5px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-3) var(--space-4)',
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--text-primary)',
                        lineHeight: 'var(--line-height-base)',
                        // Plain text content collapses newlines by default —
                        // without this a Shift+Enter-composed message reads
                        // back as one run-on line.
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {m.body}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {newMessageCount > 0 && (
            <button
              type="button"
              onClick={jumpToBottom}
              style={{
                position: 'absolute',
                bottom: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 'var(--radius-full)',
                border: 'none',
                background: 'var(--accent-safe)',
                color: 'var(--text-on-accent)',
                fontFamily: 'var(--font-family-base)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)' as unknown as number,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                cursor: 'pointer',
              }}
            >
              {t('composer.newMessages', { count: newMessageCount })} ↓
            </button>
          )}
        </div>

        <div className="dash-composer" style={{ borderTop: '0.5px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {crisisResource && (
            <Alert variant="urgent">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span>{crisisResource.message}</span>
                {crisisResource.resources.map((r) => (
                  <span key={r.name}>
                    {r.name}: {r.phone}
                    {r.url && (
                      <>
                        {' · '}
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="ds-inline-link">
                          {r.url}
                        </a>
                      </>
                    )}
                  </span>
                ))}
              </div>
            </Alert>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: isYourTurn ? 'var(--accent-safe)' : 'var(--text-secondary)', fontWeight: isYourTurn ? ('var(--font-weight-medium)' as unknown as number) : undefined }}>
              {turnStatusText}
            </span>
            {turnSecondsLeft !== null && (
              <span
                role="timer"
                aria-live="polite"
                style={{
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 'var(--font-weight-bold)' as unknown as number,
                  color: 'var(--signal-urgent)',
                  background: 'var(--signal-urgent-surface)',
                  border: '1px solid var(--signal-urgent)',
                  borderRadius: 'var(--radius-full)',
                  padding: '1px 8px',
                }}
              >
                {draft.trim() && autoSendEnabled
                  ? t('composer.sendingIn', { count: turnSecondsLeft })
                  : t('composer.skippingIn', { count: turnSecondsLeft })}
              </span>
            )}
            {turnSecondsLeft !== null && (
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{t('composer.keepTypingToPause')}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            <textarea
              ref={composerTextareaRef}
              className="dash-composer-textarea"
              rows={1}
              style={{ flex: '1 1 160px', boxSizing: 'border-box' }}
              // Composing ahead is always allowed, even before it's your
              // turn — only actually sending is turn-gated (sendNow itself
              // no-ops if it isn't your turn yet; the Send button below is
              // separately disabled for the same reason). Still blocked
              // once the session itself is over — there's nothing left to
              // send to. Also locked for the duration of an in-flight send:
              // editing a message that's already on its way to the server
              // would be confusing (which text actually got sent?), and the
              // draft is about to be cleared out from under it anyway.
              disabled={sessionState?.status !== 'active' || isSending}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Shift+Enter falls through to the textarea's own default
                // behavior (insert a newline) — only a bare Enter sends.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void sendNow()
                }
              }}
              placeholder={isYourTurn ? t('composer.placeholderYourTurn') : t('composer.placeholderWaiting')}
            />
            <div className="dash-composer-actions--desktop">
              <div className="dash-send-split">
                <button
                  type="button"
                  className="dash-send-split__main"
                  disabled={!isYourTurn || isSending || !draft.trim()}
                  onClick={() => void sendNow()}
                >
                  {isSending ? <Spinner size={14} /> : t('composer.send')}
                </button>
                <button
                  type="button"
                  className="dash-send-split__toggle"
                  aria-label={t('composer.sendOptions')}
                  aria-expanded={sendMenuOpen}
                  onClick={() => setSendMenuOpen((v) => !v)}
                >
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
                    <path d="M1 5L5 1L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {sendMenuOpen && (
                  <>
                    <div className="dash-send-backdrop" onClick={() => setSendMenuOpen(false)} />
                    <div className="dash-send-menu">
                      <Switch className="dash-send-menu__option" isSelected={autoSendEnabled} onChange={setAutoSendEnabled}>
                        {t('composer.autoSendToggle')}
                      </Switch>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="dash-composer-actions--mobile">
              <div className="dash-send-split">
                <button
                  type="button"
                  className="dash-send-split__main"
                  disabled={!isYourTurn || isSending || !draft.trim()}
                  onClick={() => void sendNow()}
                >
                  {isSending ? <Spinner size={14} /> : t('composer.send')}
                </button>
                <button
                  type="button"
                  className="dash-send-split__toggle"
                  aria-label={t('composer.sendOptions')}
                  aria-expanded={sendMenuOpen}
                  onClick={() => setSendMenuOpen((v) => !v)}
                >
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
                    <path d="M1 5L5 1L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {sendMenuOpen && (
                  <>
                    <div className="dash-send-backdrop" onClick={() => setSendMenuOpen(false)} />
                    <div className="dash-send-menu">
                      <Switch className="dash-send-menu__option" isSelected={autoSendEnabled} onChange={setAutoSendEnabled}>
                        {t('composer.autoSendToggle')}
                      </Switch>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="dash-center" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
      {content}
      {showLoadingOverlay && <CenterPanelLoadingOverlay exiting={!isLoadingGate} />}
    </div>
  )
}

export function DashboardPage({ sessionId, onNavigate }: { sessionId: string; onNavigate: (sessionId: string) => void }) {
  const { t } = useTranslation('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [newSessionOpen, setNewSessionOpen] = useState(false)
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [searchDraft, setSearchDraft] = useState('')
  const [reportable, setReportable] = useState<Member[]>([])
  // Bumped by SessionCenterPanel's onVisited, once a session's visit is
  // actually recorded server-side — see useRecentVisits' refreshKey
  // param for why this can't just be `sessionId` (that fires the
  // background refresh before the visit lands, racing to a stale order).
  const [visitNonce, setVisitNonce] = useState(0)

  const { visits, loadingInitial: visitsLoading, loadingMore, error: visitsError, hasMore, loadMore } = useRecentVisits(searchDraft, String(visitNonce))

  function selectVisit(id: string) {
    setMobileMenuOpen(false)
    if (id !== sessionId) onNavigate(id)
  }

  const sidebarHeader = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: 'var(--radius-full)', border: '1.5px solid var(--text-primary)' }} />
          <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)' as unknown as number, color: 'var(--text-primary)' }}>
            MinCirklen
          </span>
        </div>
        <IconButton
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
          label={t('sidebar.account')}
          onClick={() => setAccountModalOpen(true)}
        />
      </div>
      <Button variant="safe" onPress={() => setNewSessionOpen(true)} style={{ width: '100%' }}>
        {t('sidebar.newSession')}
      </Button>
      <input
        placeholder={t('sidebar.searchSessions')}
        className="ds-textfield__input dash-sidebar-search"
        value={searchDraft}
        onChange={(e) => setSearchDraft(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box' }}
      />
    </>
  )

  const sidebarList = (
    <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {visitsLoading && <DashboardSidebarSkeleton />}
      {visitsError && <Alert variant="urgent">{visitsError}</Alert>}
      {!visitsLoading && !visitsError && (
        <>
          <RecentVisitsList visits={visits} activeId={sessionId} search={searchDraft} onSelect={selectVisit} />
          {visits.length === 0 && (
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', textAlign: 'center', padding: '12px 0' }}>
              {t('sidebar.noSessionsMatch')}
            </div>
          )}
          {hasMore && (
            <Button variant="ghost" isPending={loadingMore} onPress={loadMore} style={{ width: '100%' }}>
              {t('sidebar.loadMore')}
            </Button>
          )}
        </>
      )}
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
          {t('rightPanel.essentialPages')}
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
                {t('rightPanel.transparency')}
              </a>
            )}
          </div>
        ))}
      </div>
      <div style={{ borderTop: '0.5px solid var(--border-subtle)' }} />
      <div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
          {t('rightPanel.ifInCrisis')}
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
          {t('rightPanel.crisisResources')}
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
          {t('rightPanel.reportThisSession')}
        </button>
      </div>
    </>
  )

  return (
    <div className="dash-root" style={{ display: 'flex', height: '100%', fontFamily: 'var(--font-family-base)', background: 'var(--surface-app)' }}>
      <ReportSessionModal isOpen={reportOpen} onOpenChange={setReportOpen} reportable={reportable} />
      <NewSessionModal isOpen={newSessionOpen} onOpenChange={setNewSessionOpen} onJoined={(id) => onNavigate(id)} />
      <AccountModal isOpen={accountModalOpen} onOpenChange={setAccountModalOpen} />

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

      {/* Center panel — stays mounted across a session switch (no key=)
          so it can keep showing the previous session, blurred, until
          the new one is ready; see SessionCenterPanel's own notes. */}
      <SessionCenterPanel
        sessionId={sessionId}
        mobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={() => setMobileMenuOpen((v) => !v)}
        onReportableChange={setReportable}
        onVisited={() => setVisitNonce((n) => n + 1)}
      />

      {/* Desktop-only companion column for rightPanelContent — hidden
          below 768px (see DashboardPage.css's .dash-right rule), where
          the same content instead lives in the mobile drawer's footer
          above. */}
      <div
        className="dash-right"
        style={{
          width: 260,
          flex: 'none',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '0.5px solid var(--border-subtle)',
          padding: 'var(--space-5) var(--space-4)',
          gap: 'var(--space-4)',
          background: 'var(--surface-raised)',
          overflowY: 'auto',
        }}
      >
        {rightPanelContent}
      </div>
    </div>
  )
}
