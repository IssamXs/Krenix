'use client'

import { Languages } from 'lucide-react'
import { LOCALES, LOCALE_LABELS } from '@/lib/i18n/config'
import { useI18n } from '@/lib/i18n/LocaleProvider'

// Compact FR/AR toggle for the dashboard sidebar. Two locales today, so a
// simple segmented control beats a dropdown — extend to a <select> if a third
// locale is ever added.
export default function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const { locale, setLocale, t } = useI18n()

  return (
    <div className="flex items-center gap-1.5 px-1">
      <Languages size={13} className={dark ? 'text-dash-sidebar-ink-soft' : 'text-dash-ink-faint'} />
      <div className={`flex rounded-lg overflow-hidden border ${dark ? 'border-dash-sidebar-border' : 'border-dash-border'}`}>
        {LOCALES.map(l => (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            aria-label={`${t('languageSwitcher.label')}: ${LOCALE_LABELS[l]}`}
            aria-pressed={locale === l}
            className={`px-2 py-1 text-[11px] font-bold transition-colors ${
              locale === l
                ? 'bg-dash-accent text-white'
                : dark
                  ? 'text-dash-sidebar-ink-soft hover:text-dash-sidebar-ink'
                  : 'text-dash-ink-soft hover:text-dash-ink'
            }`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  )
}
