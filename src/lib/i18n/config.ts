// ============================================================
// KRENIX — i18n configuration
// Platform-wide locale support (FR default, AR added).
// No localStorage per project rules — locale persists via a plain
// (non-httpOnly) cookie so both server and client can read it.
// ============================================================

export const LOCALES = ['fr', 'ar'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'fr'
export const LOCALE_COOKIE = 'krenix_locale'

export const RTL_LOCALES: readonly Locale[] = ['ar']

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale)
}

export function dirFor(locale: Locale): 'rtl' | 'ltr' {
  return isRtl(locale) ? 'rtl' : 'ltr'
}

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value)
}

export const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'Français',
  ar: 'العربية',
}
