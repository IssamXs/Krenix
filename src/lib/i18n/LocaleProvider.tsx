'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { dirFor, LOCALE_COOKIE, type Locale } from './config'
import { fr } from './dictionaries/fr'
import { ar } from './dictionaries/ar'
import type { Dictionary } from './dictionaries/types'

const DICTIONARIES: Record<Locale, Dictionary> = { fr, ar }

interface I18nContextValue {
  locale: Locale
  dir: 'rtl' | 'ltr'
  setLocale: (locale: Locale) => void
  /** Dot-path translation lookup, e.g. t('nav.overview'). Supports {var} interpolation. */
  t: (path: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function lookup(dict: Dictionary, path: string): string {
  const value = path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) return (acc as Record<string, unknown>)[key]
    return undefined
  }, dict)
  if (typeof value !== 'string') {
    // Missing/mis-typed key — fall back to the path itself so broken
    // translations are visibly obvious in the UI instead of silently blank.
    return path
  }
  return value
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match))
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale
  children: React.ReactNode
}) {
  const router = useRouter()
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  const setLocale = useCallback((next: Locale) => {
    // Non-httpOnly cookie (not localStorage, per project rules) — readable by
    // both the server (root layout, for <html lang/dir> + font) and client.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    setLocaleState(next) // update immediately so client components re-render now
    router.refresh()     // re-run server components (root layout) with the new cookie
  }, [router])

  const t = useCallback((path: string, vars?: Record<string, string | number>) => {
    return interpolate(lookup(DICTIONARIES[locale], path), vars)
  }, [locale])

  const value = useMemo<I18nContextValue>(() => ({
    locale, dir: dirFor(locale), setLocale, t,
  }), [locale, setLocale, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within LocaleProvider')
  return ctx
}
