'use client'

import { useState } from 'react'
import { Sparkles, Loader2, X } from 'lucide-react'
import type { PricingOption, PricingTier } from '@/lib/claude'

interface Props {
  /** Called with the chosen selling price (DZD) when the merchant picks an option. */
  onSelect: (price: number) => void
}

const TIER_META: Record<PricingTier, { label: string; accent: string }> = {
  conservateur: { label: 'Conservateur', accent: '#3B82F6' },
  recommande:   { label: 'Recommandé',   accent: '#F59E0B' },
  agressif:     { label: 'Agressif',     accent: '#EF4444' },
}

export default function PriceSuggestion({ onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [costPrice, setCostPrice] = useState('')
  const [adBudget, setAdBudget] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [options, setOptions] = useState<PricingOption[] | null>(null)

  const suggest = async () => {
    const cost = Number(costPrice)
    if (!cost || isNaN(cost) || cost <= 0) { setError('Entrez un prix de revient valide.'); return }
    setLoading(true)
    setError('')
    setOptions(null)
    try {
      const res = await fetch('/api/ai/price-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ costPrice: cost, adBudget: adBudget ? Number(adBudget) : undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Erreur, réessayez.'); return }
      setOptions(data.options as PricingOption[])
    } catch {
      setError('Erreur réseau. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  const pick = (price: number) => {
    onSelect(price)
    setOpen(false)
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-[11px] font-semibold text-dash-gold-dark hover:opacity-80 transition-opacity"
      >
        <Sparkles size={12} /> Suggérer un prix
      </button>

      {open && (
        <div className="mt-2 rounded-2xl p-4 space-y-3 border bg-dash-surface border-dash-gold/25">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-dash-ink flex items-center gap-1.5">
              <Sparkles size={13} className="text-dash-gold-dark" /> Suggestion de prix IA
            </p>
            <button type="button" onClick={() => setOpen(false)} className="text-dash-ink-soft hover:text-dash-ink transition-colors">
              <X size={14} />
            </button>
          </div>

          {!options && (
            <>
              <div>
                <label className="block text-[10px] text-dash-ink-soft mb-1 uppercase tracking-wider">Prix de revient (DZD) *</label>
                <input
                  type="number"
                  value={costPrice}
                  onChange={e => setCostPrice(e.target.value)}
                  placeholder="1500"
                  className="w-full px-3 py-2 rounded-lg bg-dash-surface-2 border border-dash-border text-dash-ink text-sm placeholder-dash-ink-faint outline-none focus:border-dash-gold/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] text-dash-ink-soft mb-1 uppercase tracking-wider">
                  Budget pub / mois (DZD) <span className="text-dash-ink-faint normal-case">— optionnel</span>
                </label>
                <input
                  type="number"
                  value={adBudget}
                  onChange={e => setAdBudget(e.target.value)}
                  placeholder="3000"
                  className="w-full px-3 py-2 rounded-lg bg-dash-surface-2 border border-dash-border text-dash-ink text-sm placeholder-dash-ink-faint outline-none focus:border-dash-gold/50 transition-all"
                />
              </div>
              {error && <p className="text-dash-danger text-xs">{error}</p>}
              <button
                type="button"
                onClick={suggest}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-white bg-dash-gold hover:bg-dash-gold-dark disabled:opacity-60 transition-all"
              >
                {loading ? <><Loader2 size={15} className="animate-spin" /> Analyse en cours…</> : <><Sparkles size={14} /> Suggérer 3 prix</>}
              </button>
            </>
          )}

          {options && (
            <div className="space-y-2">
              {options.map(opt => {
                const meta = TIER_META[opt.tier] ?? { label: opt.tier, accent: '#9CA3AF' }
                const isReco = opt.tier === 'recommande'
                return (
                  <button
                    type="button"
                    key={opt.tier}
                    onClick={() => pick(opt.price)}
                    className={`w-full text-left rounded-xl p-3 border transition-all hover:bg-dash-surface-2 ${isReco ? 'border-dash-gold bg-dash-gold-soft' : 'border-dash-border bg-transparent'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold" style={{ color: meta.accent }}>
                        {meta.label}{isReco && ' ⭐'}
                      </span>
                      <span className="text-base font-black text-dash-ink">{opt.price.toLocaleString('fr-DZ')} DZD</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] mb-1">
                      <span className="text-dash-ink-soft">Marge nette: <span className="text-dash-success font-semibold">{opt.marginDzd.toLocaleString('fr-DZ')} DZD</span></span>
                      <span className="text-dash-ink-soft">({opt.marginPct}%)</span>
                    </div>
                    <p className="text-[11px] text-dash-ink-soft leading-snug">{opt.explanation}</p>
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setOptions(null)}
                className="w-full text-center text-[11px] text-dash-ink-soft hover:text-dash-ink pt-1 transition-colors"
              >
                ← Modifier les entrées
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
