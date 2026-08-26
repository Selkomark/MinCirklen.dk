import { useEffect } from 'react'
import * as CookieConsent from 'vanilla-cookieconsent'
import 'vanilla-cookieconsent/dist/cookieconsent.css'
import './cookie-consent-theme.css'
import { publicPagePath } from './publicPages/pages'

// Mounted once at the app root. mode: 'opt-in' (the library default) means nothing
// beyond strictly-necessary cookies is ever considered accepted until the visitor
// makes a choice, and the modal auto-shows on any page until they do.
export function CookieConsentBanner() {
  useEffect(() => {
    const privacyLink = `<a href="${publicPagePath('privacy-policy')}" class="cc__link">privacy policy</a>`

    CookieConsent.run({
      guiOptions: {
        consentModal: { layout: 'bar inline', position: 'bottom', equalWeightButtons: true },
        preferencesModal: { layout: 'box', position: 'right', equalWeightButtons: true },
      },
      categories: {
        necessary: {
          readOnly: true,
          enabled: true,
        },
        analytics: {
          enabled: false,
        },
      },
      language: {
        default: 'en',
        translations: {
          en: {
            consentModal: {
              title: 'We keep this simple',
              description: `We use only the cookies needed to run the site — nothing tracks you across it. Full details in our ${privacyLink}.`,
              acceptAllBtn: 'Accept all',
              acceptNecessaryBtn: 'Necessary only',
              showPreferencesBtn: 'Manage preferences',
            },
            preferencesModal: {
              title: 'Cookie preferences',
              acceptAllBtn: 'Accept all',
              acceptNecessaryBtn: 'Necessary only',
              savePreferencesBtn: 'Save preferences',
              closeIconLabel: 'Close',
              sections: [
                {
                  title: 'Strictly necessary',
                  description:
                    "Required for the site to work — remembering your theme and this cookie choice. These can't be turned off.",
                  linkedCategory: 'necessary',
                },
                {
                  title: 'Analytics',
                  description:
                    "Not in use today. Reserved here in case we ever add privacy-respecting analytics — you'd be asked to opt in, never opted in by default.",
                  linkedCategory: 'analytics',
                },
                {
                  title: 'More information',
                  description: `See our ${privacyLink} for what we collect and your rights under GDPR.`,
                },
              ],
            },
          },
        },
      },
    })
  }, [])

  return null
}

export function showCookiePreferences() {
  CookieConsent.showPreferences()
}
