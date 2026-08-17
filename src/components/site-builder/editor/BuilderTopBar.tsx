'use client'

import { Undo2, Redo2, Monitor, Smartphone } from 'lucide-react'
import { useI18n } from '@/lib/i18n/LocaleProvider'

interface Props {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  device: 'base' | 'desktop'
  onDeviceChange: (device: 'base' | 'desktop') => void
  onPublish: () => void
  publishing: boolean
  saving: boolean
  error?: string | null
}

export default function BuilderTopBar({ canUndo, canRedo, onUndo, onRedo, device, onDeviceChange, onPublish, publishing, saving, error }: Props) {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-dash-border bg-dash-surface">
      <button type="button" onClick={onUndo} disabled={!canUndo} title={t('siteBuilder.undo')} className="w-8 h-8 rounded-lg border border-dash-border flex items-center justify-center text-dash-ink-soft disabled:opacity-30">
        <Undo2 size={14} />
      </button>
      <button type="button" onClick={onRedo} disabled={!canRedo} title={t('siteBuilder.redo')} className="w-8 h-8 rounded-lg border border-dash-border flex items-center justify-center text-dash-ink-soft disabled:opacity-30">
        <Redo2 size={14} />
      </button>
      <span className="text-xs text-dash-ink-faint ml-2">{saving ? '…' : ''}</span>
      {error && <span className="text-xs text-dash-danger ml-2">{error}</span>}
      <div className="flex-1" />
      <div className="flex rounded-lg border border-dash-border overflow-hidden">
        <button type="button" onClick={() => onDeviceChange('base')} className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${device === 'base' ? 'bg-dash-accent text-dash-surface' : 'text-dash-ink-soft'}`}>
          <Smartphone size={13} /> {t('siteBuilder.mobile')}
        </button>
        <button type="button" onClick={() => onDeviceChange('desktop')} className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${device === 'desktop' ? 'bg-dash-accent text-dash-surface' : 'text-dash-ink-soft'}`}>
          <Monitor size={13} /> {t('siteBuilder.desktop')}
        </button>
      </div>
      <div className="flex-1" />
      <button type="button" onClick={onPublish} disabled={publishing} className="px-4 py-2 rounded-[10px] bg-dash-accent text-dash-surface font-bold text-xs hover:bg-dash-accent-dark transition-all disabled:opacity-50">
        {publishing ? '…' : t('siteBuilder.publish')}
      </button>
    </div>
  )
}
