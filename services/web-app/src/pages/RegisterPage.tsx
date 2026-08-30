import { useState } from 'react'
import type { Key } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/Button'
import { TextField } from '../components/TextField'
import { Select, SelectItem } from '../components/Select'
import { Checkbox } from '../components/Checkbox'
import { Alert } from '../components/Alert'
import { publicPagePath } from '../publicPages/pages'
import { SiteHeader } from '../SiteHeader'
import { SiteFooter } from '../SiteFooter'
import { COUNTRIES } from '../countries'
import { GENDERS } from '../genders'
import { useDocumentTitle } from '../useDocumentTitle'

export interface RegisterPageProps {
  onComplete: () => void
}

export function RegisterPage({ onComplete }: RegisterPageProps) {
  const { t } = useTranslation('auth')
  useDocumentTitle(t('register.documentTitle'))

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [gender, setGender] = useState<Key | null>(null)
  const [country, setCountry] = useState<Key | null>(null)
  const [mobile, setMobile] = useState('')
  const [stayAnonymous, setStayAnonymous] = useState(true)
  const [termsChecked, setTermsChecked] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const canSubmit =
    firstName.trim() !== '' &&
    lastName.trim() !== '' &&
    gender != null &&
    country != null &&
    mobile.trim() !== '' &&
    termsChecked

  async function handleSubmit() {
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/trpc/auth.completeProfile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          gender: String(gender),
          country: String(country),
          mobileNumber: mobile.trim(),
          stayAnonymous,
        }),
      })

      if (!res.ok) {
        throw new Error(res.status === 401 ? t('register.sessionExpired') : t('register.saveFailed'))
      }

      onComplete()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('register.saveFailed'))
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
        <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 'clamp(20px, 4vw, 28px)' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>
              {t('register.title')}
            </div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 6 }}>
              {t('register.subtitle')}
            </div>
          </div>

          <div
            style={{
              background: 'var(--surface-raised)',
              border: '0.5px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: 'clamp(20px, 4vw, 32px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ flex: '1 1 180px' }}>
                <TextField
                  label={t('register.firstName')}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                />
              </div>
              <div style={{ flex: '1 1 180px' }}>
                <TextField
                  label={t('register.lastName')}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                />
              </div>
            </div>

            <Select label={t('register.gender')} placeholder={t('register.genderPlaceholder')} selectedKey={gender} onSelectionChange={setGender}>
              {GENDERS.map((g) => (
                <SelectItem key={g} id={g}>
                  {t(`register.gender_${g}`)}
                </SelectItem>
              ))}
            </Select>

            <Select
              label={t('register.country')}
              placeholder={t('register.countryPlaceholder')}
              selectedKey={country}
              onSelectionChange={setCountry}
            >
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} id={c.code}>
                  {c.name}
                </SelectItem>
              ))}
            </Select>

            <TextField
              label={t('register.mobileNumber')}
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              autoComplete="tel"
              hint={t('register.mobileHint')}
            />

            <Alert variant="safe">{t('register.nameNotShown')}</Alert>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <Checkbox isSelected={stayAnonymous} onChange={setStayAnonymous} />
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>{t('register.stayAnonymous')}</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <Checkbox isSelected={termsChecked} onChange={setTermsChecked} />
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                  {t('register.agreeToThePrefix')}{' '}
                  <a href={publicPagePath('terms-and-conditions')} target="_blank" rel="noopener noreferrer" className="ds-inline-link">
                    {t('register.termsAndConditions')}
                  </a>{' '}
                  {t('register.and')}{' '}
                  <a href={publicPagePath('privacy-policy')} target="_blank" rel="noopener noreferrer" className="ds-inline-link">
                    {t('register.privacyPolicy')}
                  </a>
                </span>
              </label>
            </div>

            {submitError && <Alert variant="urgent">{submitError}</Alert>}

            <Button variant="safe" isPending={isSubmitting} isDisabled={!canSubmit} onPress={handleSubmit} style={{ width: '100%' }}>
              {t('register.completeRegistration')}
            </Button>
          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  )
}
