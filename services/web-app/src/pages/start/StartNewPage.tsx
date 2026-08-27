import { useState } from 'react'
import { getLocalTimeZone, today, type CalendarDate, type Time } from '@internationalized/date'
import { Button } from '../../components/Button'
import { Checkbox } from '../../components/Checkbox'
import { TextField } from '../../components/TextField'
import { Alert } from '../../components/Alert'
import { DatePicker } from '../../components/DatePicker'
import { TimePicker } from '../../components/TimePicker'
import { Skeleton } from '../../components/Skeleton'
import { publicPagePath } from '../../publicPages/pages'
import { SiteHeader } from '../../SiteHeader'
import { SiteFooter } from '../../SiteFooter'
import { useDocumentTitle } from '../../useDocumentTitle'
import { Chip, DURATIONS, SIZES, StepBar, useTopics } from './shared'

export interface StartNewPageProps {
  onBack: () => void
  onComplete: (sessionId: string) => void
}

function combineToISOString(date: CalendarDate, time: Time): string {
  return new Date(date.year, date.month - 1, date.day, time.hour, time.minute).toISOString()
}

export function StartNewPage({ onBack, onComplete }: StartNewPageProps) {
  useDocumentTitle('Start a new circle — MinCirklen')

  const { topics, loading: topicsLoading, error: topicsError } = useTopics()

  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [topicId, setTopicId] = useState<string | null>(null)
  const [sizeId, setSizeId] = useState<string | null>(null)
  const [createDate, setCreateDate] = useState<CalendarDate | null>(null)
  const [createTime, setCreateTime] = useState<Time | null>(null)
  const [createDuration, setCreateDuration] = useState<string | null>(null)

  const [anonChecked, setAnonChecked] = useState(false)
  const [guidelinesChecked, setGuidelinesChecked] = useState(false)
  const [termsChecked, setTermsChecked] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const selectedTopic = topics.find((t) => t.id === topicId)
  const createIncomplete = !name.trim() || !topicId || !sizeId || !createDate || !createTime || !createDuration
  const confirmDisabled = !anonChecked || !guidelinesChecked || !termsChecked

  async function confirm() {
    if (!name.trim() || !topicId || !createDate || !createTime || !createDuration || !sizeId) return

    setSubmitError(null)
    setIsSubmitting(true)
    try {
      const capacity = SIZES.find((sz) => sz.id === sizeId)!.capacity
      const durationMinutes = DURATIONS.find((d) => d.id === createDuration)!.minutes

      const createRes = await fetch('/api/trpc/session.create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          topicId,
          name: name.trim(),
          scheduledAt: combineToISOString(createDate, createTime),
          durationMinutes,
          capacity,
        }),
      })
      if (!createRes.ok) {
        throw new Error('Something went wrong starting this circle.')
      }
      const { result } = (await createRes.json()) as { result: { data: { id: string } } }
      const sessionId = result.data.id

      const joinRes = await fetch('/api/trpc/session.join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (!joinRes.ok) {
        throw new Error('Your circle was created, but joining it failed — try again.')
      }

      onComplete(sessionId)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong starting this circle.')
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>Start a new circle</div>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>Set the topic, time, and how many can join</div>
                </div>

                {topicsError && <Alert variant="urgent">{topicsError}</Alert>}

                <TextField
                  label="Circle name"
                  hint="Shown to others browsing circles to join — make it your own"
                  placeholder="e.g. Sunday evening check-in"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--text-primary)' }}>Topic</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {topicsLoading &&
                      Array.from({ length: 6 }, (_, i) => (
                        <Skeleton key={i} width={72 + (i % 3) * 20} height={32} radius="var(--radius-full)" />
                      ))}
                    {topics.map((t) => (
                      <Chip key={t.id} label={t.label} active={t.id === topicId} onClick={() => setTopicId(t.id)} />
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--text-primary)' }}>Date and time</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <DatePicker
                      aria-label="Date"
                      value={createDate}
                      onChange={setCreateDate}
                      minValue={today(getLocalTimeZone())}
                      maxValue={today(getLocalTimeZone()).add({ days: 7 })}
                      style={{ flex: '1 1 200px' }}
                    />
                    <TimePicker aria-label="Time" value={createTime} onChange={setCreateTime} style={{ flex: '1 1 160px' }} />
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
                  <Button variant="ghost" onClick={onBack}>Back</Button>
                  <Button variant="safe" isDisabled={createIncomplete} onClick={() => setStep(2)}>Continue</Button>
                </div>
              </div>
            )}

            {step === 2 && selectedTopic && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>Before you begin</div>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>
                    Starting "{name.trim()}"
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
                  <Button variant="safe" isPending={isSubmitting} isDisabled={confirmDisabled} onClick={confirm}>Start circle</Button>
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
