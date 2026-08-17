'use client'

import { useEffect, useState } from 'react'
import { Send, Loader2, Trash2, Copy, Check, ExternalLink, AlertCircle } from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import LockedFeatureCard from '@/components/dashboard/ui/LockedFeatureCard'
import { useI18n } from '@/lib/i18n/LocaleProvider'

const INPUT = 'w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm'

interface Recipient { id: string; label: string; chatHint: string }

// Telegram new-order alerts. Connecting a recipient is a handshake, not a form:
// a bot can't message a phone number, so we mint a t.me deep link, the person
// opens it and presses Start, and the webhook records their chat id. That's why
// there is no "chat id" input here — see database/059_telegram_order_alerts.sql.
export default function TelegramAlertsCard({ isUltimate }: { isUltimate: boolean }) {
  const { t } = useI18n()
  // Seeded from the plan rather than flipped in the effect: a non-Ultimate
  // store never fetches, so it has nothing to wait for.
  const [loading, setLoading] = useState(isUltimate)
  const [configured, setConfigured] = useState(true)
  const [enabled, setEnabled] = useState(true)
  const [max, setMax] = useState(3)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [label, setLabel] = useState('')
  const [link, setLink] = useState('')
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const res = await fetch('/api/integrations/telegram')
      if (!res.ok) { setLoading(false); return }
      const d = await res.json()
      setConfigured(!!d.configured)
      setEnabled(!!d.enabled)
      setMax(d.maxRecipients ?? 3)
      setRecipients(d.recipients ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (isUltimate) load() }, [isUltimate])

  const toggle = async () => {
    const next = !enabled
    setEnabled(next)
    const res = await fetch('/api/integrations/telegram', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    })
    if (!res.ok) setEnabled(!next) // roll back the optimistic flip
  }

  const generate = async () => {
    setGenerating(true); setError(''); setLink(''); setCopied(false)
    try {
      const res = await fetch('/api/integrations/telegram', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Erreur.'); return }
      setLink(d.url)
    } finally {
      setGenerating(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm(t('settings.telegramConfirmRemove'))) return
    setRecipients(rs => rs.filter(r => r.id !== id))
    await fetch(`/api/integrations/telegram?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked — the link is visible and selectable anyway */ }
  }

  if (!isUltimate) {
    return <LockedFeatureCard title={t('settings.telegramLocked')} requiredPlan="Ultimate" />
  }

  if (loading) {
    return (
      <Card className="flex items-center justify-center py-10">
        <Loader2 className="animate-spin text-dash-accent" size={20} />
      </Card>
    )
  }

  const atMax = recipients.length >= max

  return (
    <Card delayMs={60} className="space-y-5">
      <div className="flex items-center gap-2">
        <Send size={16} className="text-dash-info" />
        <h3 className="text-dash-ink font-bold">{t('settings.telegramTitle')}</h3>
      </div>
      <p className="text-dash-ink-soft text-xs">{t('settings.telegramHint')}</p>

      {!configured ? (
        <div className="flex items-start gap-2 text-xs text-dash-warning-dark bg-dash-warning-soft rounded-lg px-3 py-2">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
          <span>{t('settings.telegramUnavailable')}</span>
        </div>
      ) : (
        <>
          {/* Master switch */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-dash-ink text-sm font-medium">{t('settings.telegramEnabled')}</p>
              <p className="text-dash-ink-soft text-xs mt-0.5">{t('settings.telegramEnabledHint')}</p>
            </div>
            <button
              onClick={toggle}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-dash-success' : 'bg-dash-border'}`}
              aria-label={t('settings.telegramEnabled')}
            >
              <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow" style={{ left: enabled ? '22px' : '2px' }} />
            </button>
          </div>

          {/* Connected recipients */}
          <div className="space-y-2">
            <p className="text-xs text-dash-ink-soft uppercase tracking-wider font-bold">
              {t('settings.telegramRecipients')} ({recipients.length}/{max})
            </p>
            {recipients.length === 0 ? (
              <p className="text-dash-ink-faint text-xs bg-dash-surface-2 rounded-xl px-3 py-3">
                {t('settings.telegramEmpty')}
              </p>
            ) : (
              recipients.map(r => (
                <div key={r.id} className="flex items-center gap-3 bg-dash-surface-2 rounded-xl px-3 py-2.5">
                  <Send size={13} className="text-dash-info flex-shrink-0" />
                  <span className="text-dash-ink text-sm font-medium truncate">{r.label}</span>
                  <span className="text-dash-ink-faint text-xs font-mono">···{r.chatHint}</span>
                  <button
                    onClick={() => remove(r.id)}
                    className="ml-auto text-dash-ink-faint hover:text-dash-danger transition-colors flex-shrink-0"
                    aria-label={t('settings.telegramRemove')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Add a recipient */}
          {atMax ? (
            <p className="text-dash-ink-faint text-xs">{t('settings.telegramMaxReached')}</p>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                maxLength={40}
                placeholder={t('settings.telegramLabelPlaceholder')}
                className={INPUT}
              />
              <button
                onClick={generate}
                disabled={generating || !label.trim()}
                className="px-4 py-3 rounded-xl bg-dash-accent text-dash-surface text-sm font-bold hover:bg-dash-accent-dark disabled:opacity-50 transition-colors flex items-center justify-center gap-2 flex-shrink-0"
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {t('settings.telegramGenerate')}
              </button>
            </div>
          )}

          {error && (
            <p className="text-dash-danger text-xs flex items-center gap-1.5">
              <AlertCircle size={13} /> {error}
            </p>
          )}

          {/* The freshly minted deep link */}
          {link && (
            <div className="space-y-2 border border-dash-border rounded-xl p-3 bg-dash-surface-2">
              <p className="text-dash-ink text-sm font-semibold">{t('settings.telegramLinkTitle')}</p>
              <p className="text-dash-ink-soft text-xs">{t('settings.telegramLinkHint')}</p>
              <p className="text-dash-ink text-xs font-mono break-all bg-dash-surface rounded-lg px-3 py-2 border border-dash-border">{link}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={copy}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-dash-surface border border-dash-border text-dash-ink hover:border-dash-accent/50 transition-colors"
                >
                  {copied ? <Check size={12} className="text-dash-success" /> : <Copy size={12} />}
                  {copied ? t('settings.telegramCopied') : t('settings.telegramCopy')}
                </button>
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-dash-info-soft text-dash-info hover:opacity-80 transition-opacity"
                >
                  <ExternalLink size={12} /> {t('settings.telegramOpen')}
                </a>
                {/* The webhook records the recipient asynchronously, so give the
                    owner an explicit way to pull the list after pressing Start. */}
                <button
                  onClick={load}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-dash-accent hover:text-dash-accent-dark transition-colors"
                >
                  ↻ {t('settings.telegramRecipients')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
