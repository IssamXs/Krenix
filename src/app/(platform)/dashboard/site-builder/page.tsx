'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { FileText, Plus, Pencil, ExternalLink, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import { ULTIMATE_PLANS, type Plan, type SitePage, type Store } from '@/types/database'
import Card from '@/components/dashboard/ui/Card'
import LockedFeatureCard from '@/components/dashboard/ui/LockedFeatureCard'
import { useI18n } from '@/lib/i18n/LocaleProvider'

export default function SiteBuilderPagesPage() {
  const { t } = useI18n()
  const [pages, setPages] = useState<SitePage[]>([])
  const [store, setStore] = useState<Store | null>(null)
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const storeData = await resolveActiveStore(supabase, user.id) as Store | null
      if (!storeData) return
      setStore(storeData)
      if (ULTIMATE_PLANS.includes(storeData.plan as Plan)) {
        const res = await supabase.from('site_pages').select('*').eq('store_id', storeData.id).order('updated_at', { ascending: false })
        setPages((res.data ?? []) as SitePage[])
      }
      setLoading(false)
    })
  }, [])

  const getPublicUrl = (slug: string) => {
    if (!store) return ''
    return process.env.NODE_ENV === 'production'
      ? `https://${store.slug}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'krenix.store'}/${slug}`
      : `/store/${slug}?store=${store.slug}`
  }

  const deletePage = async (page: SitePage) => {
    if (!confirm(t('siteBuilder.confirmDelete', { title: page.title }))) return
    setDeletingId(page.id)
    await fetch(`/api/site-pages/${page.id}`, { method: 'DELETE' })
    setPages(prev => prev.filter(p => p.id !== page.id))
    setDeletingId(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-dash-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!store || !ULTIMATE_PLANS.includes(store.plan as Plan)) {
    return (
      <div className="max-w-2xl">
        <LockedFeatureCard title={t('siteBuilder.lockedTitle')} requiredPlan={t('siteBuilder.lockedRequiredPlan')} />
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] tracking-[0.09em] uppercase text-dash-accent font-bold">{t('siteBuilder.eyebrow')}</div>
          <h1 className="dash-font-heading font-medium text-[32px] mt-1 text-dash-ink">{t('siteBuilder.title')}</h1>
        </div>
        <Link href="/dashboard/site-builder/new" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[11px] bg-dash-accent text-dash-surface font-bold text-sm hover:bg-dash-accent-dark transition-all">
          <Plus size={16} /> {t('siteBuilder.newPage')}
        </Link>
      </motion.div>

      {pages.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 gap-4">
          <FileText size={40} className="text-dash-ink-faint" />
          <div className="text-center">
            <p className="text-dash-ink-soft font-medium">{t('siteBuilder.emptyTitle')}</p>
            <p className="text-dash-ink-faint text-sm mt-1">{t('siteBuilder.emptyHint')}</p>
          </div>
          <Link href="/dashboard/site-builder/new" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-dash-accent-soft text-dash-accent-dark text-sm hover:opacity-80 transition-all font-semibold">
            <Plus size={14} /> {t('siteBuilder.newPage')}
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pages.map((page, i) => (
            <Card key={page.id} hover delayMs={i * 50} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-dash-ink font-semibold truncate">{page.title}</p>
                  <p className="text-dash-ink-faint text-xs mt-0.5 font-mono truncate">/{page.slug}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${page.status === 'published' ? 'bg-dash-success-soft text-dash-success' : 'bg-dash-surface-2 text-dash-ink-faint'}`}>
                  {page.status === 'published' ? t('siteBuilder.statusPublished') : t('siteBuilder.statusDraft')}
                </span>
              </div>
              <div className="flex items-center gap-1.5 pt-1 border-t border-dash-border">
                <Link href={`/dashboard/site-builder/${page.id}`} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-dash-ink-soft hover:text-dash-ink hover:bg-dash-surface-2 transition-all">
                  <Pencil size={12} /> {t('siteBuilder.edit')}
                </Link>
                {page.status === 'published' && (
                  <a href={getPublicUrl(page.slug)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-dash-ink-soft hover:text-dash-ink hover:bg-dash-surface-2 transition-all">
                    <ExternalLink size={12} /> {t('siteBuilder.view')}
                  </a>
                )}
                <button onClick={() => deletePage(page)} disabled={deletingId === page.id} className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-dash-danger/60 hover:text-dash-danger hover:bg-dash-danger-soft transition-all disabled:opacity-50">
                  <Trash2 size={12} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
