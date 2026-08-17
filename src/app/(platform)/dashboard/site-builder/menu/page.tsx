'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { SiteMenuItem, SitePage, Store } from '@/types/database'
import Card from '@/components/dashboard/ui/Card'
import { Trash2, GripVertical } from 'lucide-react'
import { useI18n } from '@/lib/i18n/LocaleProvider'

export default function SiteMenuPage() {
  const { t } = useI18n()
  const [store, setStore] = useState<Store | null>(null)
  const [pages, setPages] = useState<SitePage[]>([])
  const [menu, setMenu] = useState<SiteMenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const storeData = await resolveActiveStore(supabase, user.id) as Store | null
      if (!storeData) return
      setStore(storeData)
      setMenu(storeData.settings?.siteMenu ?? [])
      const { data } = await supabase.from('site_pages').select('*').eq('store_id', storeData.id).eq('status', 'published')
      setPages((data ?? []) as SitePage[])
      setLoading(false)
    })
  }, [])

  const addLink = (type: SiteMenuItem['type']) => {
    setMenu(prev => [...prev, {
      id: crypto.randomUUID(),
      label: type === 'builtin' ? 'Accueil' : '',
      type,
      target: type === 'builtin' ? 'home' : type === 'page' ? (pages[0]?.slug ?? '') : '',
      order: prev.length,
    }])
  }

  const updateLink = (id: string, patch: Partial<SiteMenuItem>) => {
    setMenu(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item))
  }

  const removeLink = (id: string) => {
    setMenu(prev => prev.filter(item => item.id !== id).map((item, i) => ({ ...item, order: i })))
  }

  const save = async () => {
    setSaved(false)
    await fetch('/api/site-menu', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menu }),
    })
    setSaved(true)
  }

  if (loading || !store) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-dash-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">{t('siteBuilder.menuTitle')}</h1>

      <Card className="space-y-3">
        {menu.map(item => (
          <div key={item.id} className="flex items-center gap-2">
            <GripVertical size={14} className="text-dash-ink-faint flex-shrink-0" />
            <input
              value={item.label}
              onChange={e => updateLink(item.id, { label: e.target.value })}
              placeholder={t('siteBuilder.menuLabelPlaceholder')}
              className="flex-1 border border-dash-border rounded-lg px-2 py-1.5 text-sm"
            />
            {item.type === 'page' ? (
              <select value={item.target} onChange={e => updateLink(item.id, { target: e.target.value })} className="border border-dash-border rounded-lg px-2 py-1.5 text-sm">
                {pages.map(p => <option key={p.id} value={p.slug}>{p.title}</option>)}
              </select>
            ) : item.type === 'url' ? (
              <input
                value={item.target}
                onChange={e => updateLink(item.id, { target: e.target.value })}
                placeholder="https://…"
                className="border border-dash-border rounded-lg px-2 py-1.5 text-sm w-40"
              />
            ) : (
              <select value={item.target} onChange={e => updateLink(item.id, { target: e.target.value })} className="border border-dash-border rounded-lg px-2 py-1.5 text-sm">
                <option value="home">Accueil</option>
                <option value="products">Produits</option>
              </select>
            )}
            <button type="button" onClick={() => removeLink(item.id)} className="text-dash-danger/60 hover:text-dash-danger">
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <div className="flex gap-2 pt-2 border-t border-dash-border">
          <button type="button" onClick={() => addLink('builtin')} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-dash-surface-2 text-dash-ink-soft hover:opacity-80">+ Lien intégré</button>
          <button type="button" onClick={() => addLink('page')} disabled={pages.length === 0} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-dash-surface-2 text-dash-ink-soft hover:opacity-80 disabled:opacity-40">+ Page</button>
          <button type="button" onClick={() => addLink('url')} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-dash-surface-2 text-dash-ink-soft hover:opacity-80">+ {t('siteBuilder.menuAddLink')}</button>
        </div>
      </Card>

      <button type="button" onClick={save} className="px-5 py-2.5 rounded-[11px] bg-dash-accent text-dash-surface font-bold text-sm hover:bg-dash-accent-dark transition-all">
        {t('siteBuilder.menuSave')}
      </button>
      {saved && <p className="text-dash-success text-sm">{t('siteBuilder.menuSaved')}</p>}
    </div>
  )
}
