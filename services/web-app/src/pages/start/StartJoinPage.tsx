import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CalendarDate } from '@internationalized/date'
import { Button } from '../../components/Button'
import { Badge } from '../../components/Badge'
import { Checkbox } from '../../components/Checkbox'
import { Alert } from '../../components/Alert'
import { DatePicker } from '../../components/DatePicker'
import { Skeleton } from '../../components/Skeleton'
import { ScrollHint } from '../../components/ScrollHint'
import { publicPagePath } from '../../publicPages/pages'
import { SiteHeader } from '../../SiteHeader'
import { SiteFooter } from '../../SiteFooter'
import { useDocumentTitle } from '../../useDocumentTitle'
import {
  DURATIONS,
  HighlightedText,
  SIZES,
  StepBar,
  describeTiming,
  displayName,
  durationLabel,
  useOpenSessions,
  useTopics,
} from './shared'

export interface StartJoinPageProps {
  onBack: () => void
  onComplete: (sessionId: string) => void
}

function CircleRowSkeleton() {
  return (
    <div style={{ border: '0.5px solid var(--border-subtle)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Skeleton width="60%" height={14} />
      <Skeleton width="40%" height={11} />
    </div>
  )
}

export function StartJoinPage({ onBack, onComplete }: StartJoinPageProps) {
  useDocumentTitle('Join a circle — MinCirklen')

  const { topics } = useTopics()

  const [step, setStep] = useState(1)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  const [searchText, setSearchText] = useState('')
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)

  // Draft values are what the panel's controls are bound to; they only
  // take effect once "Search" applies them below. The free-text search
  // box above the panel is unrelated — it stays live/debounced as the
  // user types (see useOpenSessions).
  const [draftDate, setDraftDate] = useState<CalendarDate | null>(null)
  const [draftDuration, setDraftDuration] = useState('')
  const [draftTopic, setDraftTopic] = useState('')
  const [draftSize, setDraftSize] = useState('')

  const [appliedDate, setAppliedDate] = useState<CalendarDate | null>(null)
  const [appliedDuration, setAppliedDuration] = useState('')
  const [appliedTopic, setAppliedTopic] = useState('')
  const [appliedSize, setAppliedSize] = useState('')

  const [anonChecked, setAnonChecked] = useState(false)
  const [guidelinesChecked, setGuidelinesChecked] = useState(false)
  const [termsChecked, setTermsChecked] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const durationMinutesFilter = appliedDuration ? DURATIONS.find((d) => d.id === appliedDuration)!.minutes : undefined
  const capacityFilter = appliedSize ? SIZES.find((sz) => sz.id === appliedSize)?.capacity : undefined
  const {
    sessions,
    loadingInitial,
    loadingNext,
    loadingPrevious,
    error,
    hasNext,
    hasPrevious,
    loadNext,
    loadPrevious,
    topShiftVersion,
  } = useOpenSessions({
    search: searchText || undefined,
    topicId: appliedTopic || undefined,
    capacity: capacityFilter,
    durationMinutes: durationMinutesFilter,
    date: appliedDate ? appliedDate.toString() : undefined,
  })

  // Windowed infinite scroll (Instagram-feed style): the list keeps only
  // a bounded window of pages loaded (see useOpenSessions' MAX_WINDOW_PAGES) —
  // scrolling far enough in either direction evicts the far end and
  // re-fetches from the backend, rather than growing forever. Both
  // sentinels live inside the fixed-height scrollable panel, so each
  // observer's root is that panel, not the page viewport — otherwise a
  // sentinel would read as "visible" the moment the panel is merely
  // on-screen at all.
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const bottomSentinelRef = useRef<HTMLDivElement>(null)
  // Snapshotted right before loadPrevious (always affects the top) or a
  // loadNext that might evict the top page — compared against the
  // post-update scrollHeight in the layout effect below to compensate
  // scrollTop so content changing above the viewport doesn't visibly
  // jump it.
  const preShiftScrollHeightRef = useRef<number | null>(null)

  function handleLoadNext() {
    preShiftScrollHeightRef.current = scrollContainerRef.current?.scrollHeight ?? null
    loadNext()
  }

  function handleLoadPrevious() {
    preShiftScrollHeightRef.current = scrollContainerRef.current?.scrollHeight ?? null
    loadPrevious()
  }

  useEffect(() => {
    const root = scrollContainerRef.current
    const sentinel = bottomSentinelRef.current
    if (!root || !sentinel || !hasNext) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) handleLoadNext()
      },
      { root, rootMargin: '80px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleLoadNext reads live refs, doesn't need to be a dependency
  }, [hasNext, sessions.length])

  useEffect(() => {
    const root = scrollContainerRef.current
    const sentinel = topSentinelRef.current
    if (!root || !sentinel || !hasPrevious) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) handleLoadPrevious()
      },
      { root, rootMargin: '80px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleLoadPrevious reads live refs, doesn't need to be a dependency
  }, [hasPrevious, sessions.length])

  // Runs after the DOM has the new/evicted rows but before paint —
  // exactly the window to measure the height change and cancel it out.
  // Only fires for changes that actually affect content above the
  // viewport (see topShiftVersion's doc comment in shared.tsx); a plain
  // bottom append never touches this.
  useLayoutEffect(() => {
    const before = preShiftScrollHeightRef.current
    const container = scrollContainerRef.current
    if (before == null || !container) return
    container.scrollTop += container.scrollHeight - before
    preShiftScrollHeightRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed only on the version bump, not on scroll state
  }, [topShiftVersion])

  function selectCircle(id: string) {
    setSelectedSessionId(id)
    setStep(2)
  }

  function applyFilters() {
    setAppliedDate(draftDate)
    setAppliedDuration(draftDuration)
    setAppliedTopic(draftTopic)
    setAppliedSize(draftSize)
    setFilterPanelOpen(false)
  }

  function clearFilters() {
    setDraftDate(null)
    setDraftDuration('')
    setDraftTopic('')
    setDraftSize('')
    setAppliedDate(null)
    setAppliedDuration('')
    setAppliedTopic('')
    setAppliedSize('')
  }

  const hasFilters = !!(draftDate || draftDuration || draftTopic || draftSize || appliedDate || appliedDuration || appliedTopic || appliedSize)
  const selectedSession = sessions.find((s) => s.id === selectedSessionId)
  const confirmDisabled = !anonChecked || !guidelinesChecked || !termsChecked

  async function confirm() {
    if (!selectedSessionId) return
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/trpc/session.join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: selectedSessionId }),
      })

      if (!res.ok) {
        throw new Error(res.status === 409 ? 'That circle just filled up — pick another.' : 'Something went wrong joining this circle.')
      }

      onComplete(selectedSessionId)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong joining this circle.')
      setIsSubmitting(false)
    }
  }

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
        <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 'clamp(20px, 4vw, 28px)' }}>
          <StepBar step={step} total={2} />

          <div style={{ background: 'var(--surface-raised)', border: '0.5px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'clamp(20px, 4vw, 32px)' }}>
            {step === 1 && (
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
                        width: 320,
                        maxWidth: 'calc(100vw - 48px)',
                        boxSizing: 'border-box',
                        background: 'var(--surface-raised)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 8,
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Topic</label>
                          <select className="ds-textfield__input" value={draftTopic} onChange={(e) => setDraftTopic(e.target.value)} style={{ boxSizing: 'border-box', fontSize: 'var(--font-size-xs)', height: 34, padding: '0 8px', width: 130 }}>
                            <option value="">Any</option>
                            {topics.map((t) => (
                              <option key={t.id} value={t.id}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Group size</label>
                          <select className="ds-textfield__input" value={draftSize} onChange={(e) => setDraftSize(e.target.value)} style={{ boxSizing: 'border-box', fontSize: 'var(--font-size-xs)', height: 34, padding: '0 8px', width: 100 }}>
                            <option value="">Any</option>
                            {SIZES.map((sz) => (
                              <option key={sz.id} value={sz.id}>{sz.hint}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <DatePicker label="Date" value={draftDate} onChange={setDraftDate} style={{ width: 160, maxWidth: '100%' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Duration</label>
                          <select className="ds-textfield__input" value={draftDuration} onChange={(e) => setDraftDuration(e.target.value)} style={{ boxSizing: 'border-box', fontSize: 'var(--font-size-xs)', height: 34, padding: '0 8px', width: 90 }}>
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
                            onClick={applyFilters}
                            style={{ height: 30, padding: '0 12px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--accent-safe)', color: 'var(--text-on-accent)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', cursor: 'pointer' }}
                          >
                            Search
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {!loadingInitial && !error && sessions.length > 0 && hasPrevious && (
                  <ScrollHint direction="up" label="Scroll up for later circles" />
                )}

                <div ref={scrollContainerRef} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                  {loadingInitial &&
                    Array.from({ length: 3 }, (_, i) => <CircleRowSkeleton key={i} />)}
                  {error && <Alert variant="urgent">{error}</Alert>}
                  {!loadingInitial && !error && <div ref={topSentinelRef} style={{ height: 1, flexShrink: 0 }} />}
                  {!loadingInitial && loadingPrevious && <CircleRowSkeleton />}
                  {!loadingInitial && !error && sessions.map((s) => {
                    const { timing, badgeText, badgeVariant } = describeTiming(s)
                    return (
                      <div
                        key={s.id}
                        onClick={() => selectCircle(s.id)}
                        style={{
                          cursor: 'pointer',
                          border: `0.5px solid ${s.id === selectedSessionId ? 'var(--accent-safe)' : 'var(--border-subtle)'}`,
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
                          <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>
                            <HighlightedText text={displayName(s)} query={searchText} />
                          </div>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: 2 }}>
                            {/* TODO: joinedCount reflects everyone who has ever joined, not who's
                                currently in the room. Once the chat/presence system tracks who's
                                actually connected to a session, swap this for a live active-participant
                                count instead of this static DB join tally, and make it live while this
                                page is open — see the subscribe/unsubscribe TODO on useOpenSessions in
                                shared.tsx. */}
                            {timing} · {durationLabel(DURATIONS.find((d) => d.minutes === s.durationMinutes)?.id ?? 'open')} · {s.joinedCount} of {s.capacity}
                          </div>
                        </div>
                        <Badge variant={badgeVariant}>{badgeText}</Badge>
                      </div>
                    )
                  })}
                  {!loadingInitial && !error && sessions.length === 0 && (
                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', textAlign: 'center', padding: '12px 0' }}>No open circles match those filters</div>
                  )}
                  {loadingNext && <CircleRowSkeleton />}
                  <div ref={bottomSentinelRef} style={{ height: 1, flexShrink: 0 }} />
                </div>

                {!loadingInitial && !error && sessions.length > 0 && hasNext && (
                  <ScrollHint direction="down" label="Scroll down for earlier circles" />
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <Button variant="ghost" onClick={onBack}>Back</Button>
                </div>
              </div>
            )}

            {step === 2 && selectedSession && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>Before you begin</div>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>
                    Joining "{displayName(selectedSession)}"
                  </div>
                </div>

                <Alert variant="safe">
                  You'll appear to others only as an anonymous user. Nobody in this circle will see your name, photo, or account details.
                </Alert>

                {submitError && <Alert variant="urgent">{submitError}</Alert>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                    <Checkbox isSelected={anonChecked} onChange={setAnonChecked} />
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>I understand this circle is anonymous by default</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                    <Checkbox isSelected={guidelinesChecked} onChange={setGuidelinesChecked} />
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                      I agree to the{' '}
                      <a href={publicPagePath('community-guidelines')} target="_blank" rel="noopener noreferrer" className="ds-inline-link">
                        community guidelines
                      </a>
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                    <Checkbox isSelected={termsChecked} onChange={setTermsChecked} />
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                      I agree to the{' '}
                      <a href={publicPagePath('terms-and-conditions')} target="_blank" rel="noopener noreferrer" className="ds-inline-link">
                        terms of service
                      </a>{' '}
                      and accept that MinCirklen is not liable for advice or outcomes shared in this circle
                    </span>
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                  <Button variant="safe" isPending={isSubmitting} isDisabled={confirmDisabled} onClick={confirm}>Join circle</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  )
}
