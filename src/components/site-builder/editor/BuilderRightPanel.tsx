'use client'

import { useState } from 'react'
import type { SiteBlockNode } from '@/types/database'
import { useI18n } from '@/lib/i18n/LocaleProvider'

interface Props {
  block: SiteBlockNode | null
  device: 'base' | 'desktop'
  onPropsChange: (props: Record<string, unknown>) => void
  onStyleChange: (patch: Record<string, string>) => void
}

const TEXT_PROP_TYPES = new Set(['text', 'button', 'countdown', 'order_form', 'whatsapp_button'])

export default function BuilderRightPanel({ block, device, onPropsChange, onStyleChange }: Props) {
  const { t } = useI18n()
  const [tab, setTab] = useState<'content' | 'style' | 'advanced'>('content')

  if (!block) {
    return <div className="w-[220px] flex-shrink-0 border-l border-dash-border bg-dash-surface p-4 text-xs text-dash-ink-faint">Sélectionnez un bloc pour l&apos;éditer.</div>
  }

  const currentStyle = device === 'desktop' ? (block.style.desktop ?? {}) : block.style.base

  return (
    <div className="w-[220px] flex-shrink-0 border-l border-dash-border bg-dash-surface overflow-y-auto">
      <div className="flex border-b border-dash-border">
        {(['content', 'style', 'advanced'] as const).map(key => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 py-2 text-[11px] font-bold ${tab === key ? 'text-dash-accent border-b-2 border-dash-accent' : 'text-dash-ink-faint'}`}
          >
            {key === 'content' ? t('siteBuilder.tabContent') : key === 'style' ? t('siteBuilder.tabStyle') : t('siteBuilder.tabAdvanced')}
          </button>
        ))}
      </div>

      <div className="p-3 space-y-3">
        {tab === 'content' && TEXT_PROP_TYPES.has(block.type) && (
          <div>
            <label className="text-[11px] font-semibold text-dash-ink-soft block mb-1">Texte</label>
            <textarea
              className="w-full border border-dash-border rounded-lg px-2 py-1.5 text-xs"
              value={String(block.props.text ?? block.props.title ?? '')}
              onChange={e => onPropsChange(block.props.title !== undefined ? { title: e.target.value } : { text: e.target.value })}
            />
          </div>
        )}
        {tab === 'content' && block.type === 'image' && (
          <div>
            <label className="text-[11px] font-semibold text-dash-ink-soft block mb-1">URL de l&apos;image</label>
            <input
              className="w-full border border-dash-border rounded-lg px-2 py-1.5 text-xs"
              value={String(block.props.src ?? '')}
              onChange={e => onPropsChange({ src: e.target.value })}
            />
          </div>
        )}
        {tab === 'content' && block.type === 'custom_html' && (
          <div>
            <label className="text-[11px] font-semibold text-dash-ink-soft block mb-1">HTML</label>
            <textarea
              className="w-full border border-dash-border rounded-lg px-2 py-1.5 text-xs font-mono"
              rows={8}
              value={String(block.props.html ?? '')}
              onChange={e => onPropsChange({ html: e.target.value })}
            />
          </div>
        )}

        {tab === 'style' && (
          <>
            <div>
              <label className="text-[11px] font-semibold text-dash-ink-soft block mb-1">Couleur de fond</label>
              <input
                className="w-full border border-dash-border rounded-lg px-2 py-1.5 text-xs"
                value={currentStyle.backgroundColor ?? ''}
                onChange={e => onStyleChange({ backgroundColor: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-dash-ink-soft block mb-1">Espacement interne</label>
              <input
                className="w-full border border-dash-border rounded-lg px-2 py-1.5 text-xs"
                value={currentStyle.padding ?? ''}
                onChange={e => onStyleChange({ padding: e.target.value })}
              />
            </div>
          </>
        )}

        {tab === 'advanced' && (
          <p className="text-[11px] text-dash-ink-faint">ID du bloc : {block.id}</p>
        )}
      </div>
    </div>
  )
}
