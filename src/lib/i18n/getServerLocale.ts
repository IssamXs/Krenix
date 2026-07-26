import { cookies } from 'next/headers'
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from './config'

// Server Component / Route Handler helper — reads the locale cookie directly
// (no localStorage anywhere, per project rules). Used by the root layout to
// set <html lang/dir> and pick the right font before any client JS runs.
export async function getServerLocale(): Promise<Locale> {
  const store = await cookies()
  const value = store.get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}
