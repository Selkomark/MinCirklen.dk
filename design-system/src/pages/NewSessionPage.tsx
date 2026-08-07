import { useState } from 'react'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Checkbox } from '../components/Checkbox'
import { Alert } from '../components/Alert'

type Path = 'join' | 'create' | null

interface Circle {
  id: string
  name: string
  topic: string
  size: 'small' | 'medium' | 'large'
  date: string
  time: string
  duration: string
  timing: string
  count: string
  badgeText: string
  badgeVariant: 'neutral' | 'safe' | 'info' | 'urgent'
}

const TOPICS = [
  { id: 'grief', label: 'Grief' },
  { id: 'anxiety', label: 'Anxiety' },
  { id: 'parenting', label: 'New parents' },
  { id: 'chronic', label: 'Chronic illness' },
  { id: 'career', label: 'Career transitions' },
  { id: 'sleep', label: 'Sleep and insomnia' },
]

const SIZES = [
  { id: 'small', label: 'Small', hint: 'Up to 6' },
  { id: 'medium', label: 'Medium', hint: 'Up to 8' },
  { id: 'large', label: 'Large', hint: 'Up to 12' },
]

const DURATIONS = [
  { id: '30', label: '30 min' },
  { id: '45', label: '45 min' },
  { id: '60', label: '60 min' },
  { id: '90', label: '90 min' },
  { id: 'open', label: 'Open-ended' },
]

const OPEN_CIRCLES: Circle[] = [
  { id: 'c1', name: 'Weekly grief circle', topic: 'grief', size: 'medium', date: '2026-08-07', time: '18:00', duration: '60', timing: 'Live now', count: '5 of 8', badgeText: 'Live', badgeVariant: 'info' },
  { id: 'c2', name: 'Anxiety support circle', topic: 'anxiety', size: 'small', date: '2026-08-07', time: '19:00', duration: '45', timing: 'Starts in 20 min', count: '3 of 6', badgeText: 'Starting soon', badgeVariant: 'neutral' },
  { id: 'c3', name: 'New parents circle', topic: 'parenting', size: 'medium', date: '2026-08-08', time: '18:30', duration: '60', timing: 'Tomorrow, 6:30 pm', count: '4 of 8', badgeText: 'Open', badgeVariant: 'neutral' },
  { id: 'c4', name: 'Career transitions circle', topic: 'career', size: 'small', date: '2026-08-09', time: '16:00', duration: '30', timing: 'Sun, 4:00 pm', count: '2 of 6', badgeText: 'Open', badgeVariant: 'neutral' },
  { id: 'c5', name: 'Sleep and insomnia circle', topic: 'sleep', size: 'medium', date: '2026-08-07', time: '20:00', duration: '90', timing: 'Live now', count: '6 of 8', badgeText: 'Live', badgeVariant: 'info' },
  { id: 'c6', name: 'Chronic illness circle', topic: 'chronic', size: 'medium', date: '2026-08-08', time: '17:00', duration: 'open', timing: 'Tomorrow, 5:00 pm', count: '3 of 8', badgeText: 'Open', badgeVariant: 'neutral' },
]

function durationLabel(id: string) {
  return DURATIONS.find((d) => d.id === id)?.label ?? ''
}

// Small pill-style choice control (topic / length / group size) — deliberately not a radio
// button per product direction. Reuses the safe accent tokens for the selected state.
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: 'pointer',
        border: `1px solid ${active ? 'var(--accent-safe)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-full)',
        padding: '7px 16px',
        background: active ? 'var(--accent-safe-surface)' : 'var(--surface-app)',
        color: active ? 'var(--accent-safe)' : 'var(--text-primary)',
        fontSize: 'var(--font-size-sm)',
        fontWeight: active ? 'var(--font-weight-bold)' : 'var(--font-weight-regular)',
      }}
    >
      {label}
    </div>
  )
}

// The DS Button has no disabled visual treatment (no opacity/cursor change in Button.css),
// so primary actions that can be disabled are built as plain buttons carrying that state
// explicitly rather than relying on Button's isDisabled alone.
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

export interface NewSessionPageProps {
  /** Called once the user completes step 3 — navigate to the live session page here. */
  onComplete?: (result: { path: Path; circleId?: string; circleName?: string }) => void
}

export function NewSessionPage({ onComplete }: NewSessionPageProps) {
  const [step, setStep] = useState(1)
  const [path, setPath] = useState<Path>(null)

  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null)

  const [topicId, setTopicId] = useState<string | null>(null)
  const [sizeId, setSizeId] = useState<string | null>(null)
  const [createDate, setCreateDate] = useState('')
  const [createTime, setCreateTime] = useState('')
  const [createDuration, setCreateDuration] = useState<string | null>(null)

  const [searchText, setSearchText] = useState('')
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [filterDate, setFilterDate] = useState('')
  const [filterDuration, setFilterDuration] = useState('')
  const [filterTopic, setFilterTopic] = useState('')
  const [filterSize, setFilterSize] = useState('')
  const [applied, setApplied] = useState({ searchText: '', date: '', duration: '', topic: '', size: '' })

  const [anonChecked, setAnonChecked] = useState(false)
  const [guidelinesChecked, setGuidelinesChecked] = useState(false)
  const [termsChecked, setTermsChecked] = useState(false)

  function choosePath(p: Path) {
    setPath(p)
    setStep(2)
  }

  function selectCircle(id: string) {
    setSelectedCircleId(id)
    setStep(3)
  }

  function applySearch() {
    setApplied({ searchText, date: filterDate, duration: filterDuration, topic: filterTopic, size: filterSize })
  }

  function clearFilters() {
    setSearchText('')
    setFilterDate('')
    setFilterDuration('')
    setFilterTopic('')
    setFilterSize('')
    setApplied({ searchText: '', date: '', duration: '', topic: '', size: '' })
  }

  const hasFilters = !!(searchText || filterDate || filterDuration || filterTopic || filterSize)

  const filteredCircles = OPEN_CIRCLES.filter(
    (c) =>
      (!applied.date || c.date === applied.date) &&
      (!applied.duration || c.duration === applied.duration) &&
      (!applied.topic || c.topic === applied.topic) &&
      (!applied.size || c.size === applied.size) &&
      (!applied.searchText || c.name.toLowerCase().includes(applied.searchText.toLowerCase())),
  )

  const createIncomplete = !topicId || !sizeId || !createDate || !createTime || !createDuration
  const confirmDisabled = !anonChecked || !guidelinesChecked || !termsChecked

  const selectedCircle = OPEN_CIRCLES.find((c) => c.id === selectedCircleId)
  const circleName =
    path === 'create'
      ? TOPICS.find((t) => t.id === topicId)
        ? `${TOPICS.find((t) => t.id === topicId)!.label} circle`
        : 'your new circle'
      : selectedCircle?.name ?? 'the circle'

  function confirm() {
    onComplete?.({ path, circleId: selectedCircleId ?? undefined, circleName })
    // No "your circle is starting" confirmation screen — the caller should redirect
    // straight to the live session page.
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        padding: 'clamp(20px, 6vw, 64px) clamp(16px, 5vw, 24px)',
        fontFamily: 'var(--font-family-base)',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 'clamp(20px, 4vw, 28px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 20, height: 20, borderRadius: 'var(--radius-full)', border: '1.5px solid var(--text-primary)', flex: 'none' }} />
          <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>MinCirklen</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                style={{
                  height: 3,
                  flex: 1,
                  borderRadius: 'var(--radius-full)',
                  background: n <= step ? 'var(--accent-safe)' : 'var(--border-subtle)',
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Step {step} of 3</span>
        </div>

        <div style={{ background: 'var(--surface-raised)', border: '0.5px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'clamp(20px, 4vw, 32px)' }}>
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>New session</div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>How would you like to begin</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <div
                  onClick={() => choosePath('join')}
                  style={{ cursor: 'pointer', flex: '1 1 220px', border: `0.5px solid ${path === 'join' ? 'var(--accent-safe)' : 'var(--border-subtle)'}`, borderRadius: 8, padding: 18 }}
                >
                  <div style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>Join an existing circle</div>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>Browse circles already forming</div>
                </div>
                <div
                  onClick={() => choosePath('create')}
                  style={{ cursor: 'pointer', flex: '1 1 220px', border: `0.5px solid ${path === 'create' ? 'var(--accent-safe)' : 'var(--border-subtle)'}`, borderRadius: 8, padding: 18 }}
                >
                  <div style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>Start a new circle</div>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>Set topic, time, and length</div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && path === 'join' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>Join a circle</div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>Pick a circle that fits your schedule</div>
              </div>

              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="search"
                    className="ds-textfield__input"
                    placeholder="Search circles by name"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{ flex: 1, boxSizing: 'border-box' }}
                  />
                  <button
                    aria-label="Show filters"
                    onClick={() => setFilterPanelOpen((v) => !v)}
                    style={{
                      width: 40,
                      height: 40,
                      flex: 'none',
                      borderRadius: 'var(--radius-md)',
                      border: '0.5px solid var(--border-subtle)',
                      background: filterPanelOpen ? 'var(--accent-safe-surface)' : 'transparent',
                      color: filterPanelOpen ? 'var(--accent-safe)' : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M2 3h12M4.5 8h7M7 13h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                {filterPanelOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
                      zIndex: 20,
                      background: 'var(--surface-raised)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 8,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Topic</label>
                        <select className="ds-textfield__input" value={filterTopic} onChange={(e) => setFilterTopic(e.target.value)} style={{ boxSizing: 'border-box', fontSize: 'var(--font-size-xs)', height: 34, padding: '0 8px', width: 130 }}>
                          <option value="">Any</option>
                          {TOPICS.map((t) => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Group size</label>
                        <select className="ds-textfield__input" value={filterSize} onChange={(e) => setFilterSize(e.target.value)} style={{ boxSizing: 'border-box', fontSize: 'var(--font-size-xs)', height: 34, padding: '0 8px', width: 100 }}>
                          <option value="">Any</option>
                          {SIZES.map((sz) => (
                            <option key={sz.id} value={sz.id}>{sz.hint}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Date</label>
                        <input type="date" className="ds-textfield__input" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ boxSizing: 'border-box', fontSize: 'var(--font-size-xs)', height: 34, padding: '0 8px', width: 140 }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Duration</label>
                        <select className="ds-textfield__input" value={filterDuration} onChange={(e) => setFilterDuration(e.target.value)} style={{ boxSizing: 'border-box', fontSize: 'var(--font-size-xs)', height: 34, padding: '0 8px', width: 90 }}>
                          <option value="">Any</option>
                          {DURATIONS.map((d) => (
                            <option key={d.id} value={d.id}>{d.label}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flex: 'none' }}>
                        {hasFilters && (
                          <button
                            onClick={clearFilters}
                            style={{ height: 30, padding: '0 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-primary)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', cursor: 'pointer' }}
                          >
                            Clear
                          </button>
                        )}
                        <button
                          onClick={applySearch}
                          style={{ height: 30, padding: '0 12px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--accent-safe)', color: 'var(--text-on-accent)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', cursor: 'pointer' }}
                        >
                          Search
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {filteredCircles.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => selectCircle(c.id)}
                    style={{
                      cursor: 'pointer',
                      border: `0.5px solid ${c.id === selectedCircleId ? 'var(--accent-safe)' : 'var(--border-subtle)'}`,
                      borderRadius: 8,
                      padding: 12,
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>{c.name}</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: 2 }}>
                        {c.timing} · {durationLabel(c.duration)} · {c.count}
                      </div>
                    </div>
                    <Badge variant={c.badgeVariant}>{c.badgeText}</Badge>
                  </div>
                ))}
                {filteredCircles.length === 0 && (
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', textAlign: 'center', padding: '12px 0' }}>No open circles match those filters</div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              </div>
            </div>
          )}

          {step === 2 && path === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>Start a new circle</div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>Set the topic, time, and how many can join</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--text-primary)' }}>Topic</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {TOPICS.map((t) => (
                    <Chip key={t.id} label={t.label} active={t.id === topicId} onClick={() => setTopicId(t.id)} />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--text-primary)' }}>Date and time</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <input type="date" className="ds-textfield__input" value={createDate} onChange={(e) => setCreateDate(e.target.value)} style={{ flex: '1 1 140px', boxSizing: 'border-box' }} />
                  <input type="time" className="ds-textfield__input" value={createTime} onChange={(e) => setCreateTime(e.target.value)} style={{ flex: '1 1 120px', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--text-primary)' }}>Length</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {DURATIONS.map((d) => (
                    <Chip key={d.id} label={d.label} active={d.id === createDuration} onClick={() => setCreateDuration(d.id)} />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--text-primary)' }}>Group size</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {SIZES.map((sz) => (
                    <Chip key={sz.id} label={sz.hint} active={sz.id === sizeId} onClick={() => setSizeId(sz.id)} />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                <PrimaryButton disabled={createIncomplete} onClick={() => setStep(3)}>Continue</PrimaryButton>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>Before you begin</div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>
                  {path === 'join' ? `Joining ${circleName}` : `Starting ${circleName}`}
                </div>
              </div>

              <Alert variant="safe">
                You'll appear to others only as an anonymous participant. Nobody in this circle will see your name, photo, or account details.
              </Alert>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <Checkbox isSelected={anonChecked} onChange={setAnonChecked} />
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>I understand this circle is anonymous by default</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <Checkbox isSelected={guidelinesChecked} onChange={setGuidelinesChecked} />
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                    I agree to the <a href="#">community guidelines</a>
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <Checkbox isSelected={termsChecked} onChange={setTermsChecked} />
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                    I agree to the <a href="#">terms of service</a> and accept that MinCirklen is not liable for advice or outcomes shared in this circle
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <Button variant="ghost" onClick={() => setStep(path === 'join' ? 2 : 2)}>Back</Button>
                <PrimaryButton disabled={confirmDisabled} onClick={confirm}>
                  {path === 'join' ? 'Join circle' : 'Start circle'}
                </PrimaryButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
