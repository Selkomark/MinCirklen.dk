// Mirrors the backend's SUPPORTED_LANGUAGES enum
// (packages/shared/src/schemas/userProfile.ts) — this app isn't in the Bun
// workspace those packages live in (it talks to the API over plain
// fetch, not a typed client), so this list is kept in sync by hand rather
// than imported, the same way countries.ts's codes aren't shared either.
export type SupportedLanguage = 'en' | 'sv' | 'da' | 'nb' | 'fi'

// Each language's own native name, not translated — a language picker
// showing "Svenska"/"Dansk"/"Suomi" needs no translation of its own
// labels, and is the standard convention for this kind of control.
export const SUPPORTED_LANGUAGES: { code: SupportedLanguage; nativeName: string }[] = [
  { code: 'en', nativeName: 'English' },
  { code: 'sv', nativeName: 'Svenska' },
  { code: 'da', nativeName: 'Dansk' },
  { code: 'nb', nativeName: 'Norsk' },
  { code: 'fi', nativeName: 'Suomi' },
]

// navigator.language is a BCP-47 tag ("en-US", "nb-NO", "no", ...) — only
// the primary subtag matters here. "no" (generic Norwegian) maps to "nb"
// (Bokmål), the variant this app actually has translations for.
export function detectDefaultLanguage(): SupportedLanguage {
  const primary = navigator.language.slice(0, 2).toLowerCase()
  const normalized = primary === 'no' ? 'nb' : primary
  return SUPPORTED_LANGUAGES.find((l) => l.code === normalized)?.code ?? 'en'
}
