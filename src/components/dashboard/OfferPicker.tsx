'use client'

import { useId } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { OFFER_PRESETS, type OfferType, type OfferConfig } from '@/lib/offers'
import { ToggleLeft, ToggleRight, X, Plus, Trash2 } from 'lucide-react'

export interface OfferValue {
  offerType: OfferType | null
  offerConfig: OfferConfig | null
  offerLabel: string | null
  offerActive: boolean
}

interface Props {
  value: OfferValue
  onChange: (next: OfferValue) => void
}

const inputClass =
  'w-full px-3 py-2 rounded-lg bg-dash-surface-2 border border-dash-border text-dash-ink text-sm outline-none focus:border-dash-accent/50 transition-all'

export default function OfferPicker({ value, onChange }: Props) {
  const { t } = useI18n()

  const selectPreset = (presetId: string) => {
    const preset = OFFER_PRESETS.find(p => p.id === presetId)
    if (!preset) return
    onChange({
      offerType: preset.offerType,
      offerConfig: preset.defaultConfig,
      offerLabel: preset.label,
      offerActive: true,
    })
  }

  const updateConfig = (patch: Partial<Record<string, number>>) => {
    if (!value.offerConfig) return
    onChange({ ...value, offerConfig: { ...value.offerConfig, ...patch } as OfferConfig })
  }

  const remove = () => onChange({ offerType: null, offerConfig: null, offerLabel: null, offerActive: false })

  const cfg = value.offerConfig as Record<string, unknown> | null

  return (
    <div className="space-y-4">
      <p className="text-xs text-dash-ink-faint">{t('productOffers.hint')}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {OFFER_PRESETS.map(preset => {
          const active = value.offerType === preset.offerType && value.offerLabel === preset.label
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => selectPreset(preset.id)}
              className={`text-left px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                active
                  ? 'border-dash-accent bg-dash-accent-soft text-dash-accent'
                  : 'border-dash-border text-dash-ink-soft hover:border-dash-ink-faint/40'
              }`}
            >
              {preset.label}
            </button>
          )
        })}
      </div>

      {value.offerType && cfg && (
        <div className="rounded-xl border border-dash-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => onChange({ ...value, offerActive: !value.offerActive })}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all ${
                value.offerActive
                  ? 'border-dash-accent/40 bg-dash-accent-soft text-dash-accent'
                  : 'border-dash-border text-dash-ink-faint'
              }`}
            >
              {value.offerActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              {value.offerActive ? t('productOffers.active') : t('productOffers.inactive')}
            </button>
            <button
              type="button"
              onClick={remove}
              className="flex items-center gap-1 text-xs text-dash-danger hover:opacity-80 transition-opacity"
            >
              <X size={13} /> {t('productOffers.remove')}
            </button>
          </div>

          {value.offerType === 'buy_x_get_y_free' && (
            <div className="grid grid-cols-2 gap-3">
              <NumberField label={t('productOffers.buyQtyLabel')} value={cfg.buyQty as number} onChange={n => updateConfig({ buyQty: n })} />
              <NumberField label={t('productOffers.freeQtyLabel')} value={cfg.freeQty as number} onChange={n => updateConfig({ freeQty: n })} />
            </div>
          )}
          {value.offerType === 'buy_x_get_percent_off' && (
            <div className="grid grid-cols-2 gap-3">
              <NumberField label={t('productOffers.buyQtyLabel')} value={cfg.buyQty as number} onChange={n => updateConfig({ buyQty: n })} />
              <NumberField label={t('productOffers.percentOffLabel')} value={cfg.percentOff as number} onChange={n => updateConfig({ percentOff: n })} />
            </div>
          )}
          {value.offerType === 'nth_item_percent_off' && (
            <div className="grid grid-cols-2 gap-3">
              <NumberField label={t('productOffers.nthLabel')} value={cfg.nth as number} onChange={n => updateConfig({ nth: n })} />
              <NumberField label={t('productOffers.percentOffLabel')} value={cfg.percentOff as number} onChange={n => updateConfig({ percentOff: n })} />
            </div>
          )}
          {value.offerType === 'bundle_fixed_price' && (
            <div className="grid grid-cols-2 gap-3">
              <NumberField label={t('productOffers.bundleQtyLabel')} value={cfg.bundleQty as number} onChange={n => updateConfig({ bundleQty: n })} />
              <NumberField label={t('productOffers.bundlePriceLabel')} value={cfg.bundlePrice as number} onChange={n => updateConfig({ bundlePrice: n })} />
            </div>
          )}
          {value.offerType === 'flat_percent_off' && (
            <NumberField label={t('productOffers.percentOffLabel')} value={cfg.percentOff as number} onChange={n => updateConfig({ percentOff: n })} />
          )}
          {value.offerType === 'tiered_discount' && (
            <TieredEditor
              tiers={(cfg.tiers as { minQty: number; percentOff: number }[]) ?? []}
              onChange={tiers => onChange({ ...value, offerConfig: { tiers } })}
              t={t}
            />
          )}
        </div>
      )}
    </div>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-dash-ink-soft mb-1.5">{label}</label>
      <input id={id} type="number" value={Number.isFinite(value) ? value : 0}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className={inputClass} />
    </div>
  )
}

function TieredEditor({ tiers, onChange, t }: {
  tiers: { minQty: number; percentOff: number }[]
  onChange: (tiers: { minQty: number; percentOff: number }[]) => void
  t: (key: string) => string
}) {
  const baseId = useId()
  return (
    <div className="space-y-2">
      <p className="text-xs text-dash-ink-faint">{t('productOffers.tiersHint')}</p>
      {tiers.map((tier, i) => {
        const minQtyId = `${baseId}-minqty-${i}`
        const percentOffId = `${baseId}-percentoff-${i}`
        return (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor={minQtyId} className="block text-xs text-dash-ink-soft mb-1.5">{t('productOffers.tierMinQtyLabel')}</label>
              <input id={minQtyId} type="number" value={tier.minQty}
                onChange={e => onChange(tiers.map((x, j) => j === i ? { ...x, minQty: Number(e.target.value) || 0 } : x))}
                className={inputClass} />
            </div>
            <div className="flex-1">
              <label htmlFor={percentOffId} className="block text-xs text-dash-ink-soft mb-1.5">{t('productOffers.tierPercentOffLabel')}</label>
              <input id={percentOffId} type="number" value={tier.percentOff}
                onChange={e => onChange(tiers.map((x, j) => j === i ? { ...x, percentOff: Number(e.target.value) || 0 } : x))}
                className={inputClass} />
            </div>
            <button type="button" onClick={() => onChange(tiers.filter((_, j) => j !== i))}
              aria-label={t('productOffers.removeTier')}
              className="p-2 rounded-lg text-dash-danger hover:bg-dash-danger-soft transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        )
      })}
      <button type="button" onClick={() => onChange([...tiers, { minQty: 1, percentOff: 10 }])}
        className="flex items-center gap-1.5 text-xs text-dash-accent hover:opacity-80 transition-opacity">
        <Plus size={13} /> {t('productOffers.addTier')}
      </button>
    </div>
  )
}
