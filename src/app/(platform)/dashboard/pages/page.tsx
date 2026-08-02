'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { FileText, Lock, Sparkles, Pencil, Copy, Trash2, ExternalLink, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { LandingPage, Store } from '@/types/database'
import Card from '@/components/dashboard/ui/Card'
import { useI18n } from '@/lib/i18n/LocaleProvider'

export default function PagesPage() {
  const { t } = useI18n()
  const [pages, setPages] = useState<LandingPage[]>([])
  const [store, setStore] = useState<Store | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const storeData = await resolveActiveStore(supabase, user.id) as Store | null
      if (!storeData) return
      setStore(storeData)
      const pagesRes = await supabase.from('landing_pages').select('*').eq('store_id', storeData.id).order('created_at', { ascending: false })
      setPages((pagesRes.data ?? []) as LandingPage[])
      setLoading(false)
    })
  }, [])

  const getPublicUrl = (pageSlug: string) => {
    if (!store) return ''
    return process.env.NODE_ENV === 'production'
      ? `https://${store.slug}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'krenix.store'}/p/${pageSlug}`
      : `/store/p/${pageSlug}?store=${store.slug}`
  }

  const copyLink = (page: LandingPage) => {
    navigator.clipboard.writeText(getPublicUrl(page.slug))
    setCopiedId(page.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const deletePage = async (page: LandingPage) => {
    if (!confirm(t('landingPagesList.confirmDelete', { title: page.title }))) return
    setDeletingId(page.id)
    const supabase = createClient()
    await supabase.from('landing_pages').delete().eq('id', page.id)
    setPages(prev => prev.filter(p => p.id !== page.id))
    setDeletingId(null)
  }

  const CREDITS_PER_PAGE = 5
  const credits = store?.ai_credits ?? 0
  const canCreate = credits >= CREDITS_PER_PAGE
  const pagesRemaining = Math.floor(credits / CREDITS_PER_PAGE)

  return (
    <div className="max-w-4xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] tracking-[0.09em] uppercase text-dash-accent font-bold">{t('landingPagesList.eyebrow')}</div>
          <h1 className="dash-font-heading font-medium text-[32px] mt-1 text-dash-ink">{t('landingPagesList.title')}</h1>
        </div>
        {canCreate ? (
          <Link href="/dashboard/pages/new" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[11px] bg-dash-accent text-dash-surface font-bold text-sm hover:bg-dash-accent-dark transition-all">
            <Sparkles size={16} /> {t('landingPagesList.generateWithAI')}
          </Link>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-[11px] bg-dash-surface-2 border border-dash-border text-dash-ink-faint text-sm">
            <Lock size={14} /> {t('landingPagesList.outOfCredits')}
          </div>
        )}
      </motion.div>

      <div className="bg-dash-accent-soft/50 border border-dash-accent/20 rounded-xl p-4 flex items-center gap-3">
        <Sparkles size={18} className="text-dash-accent flex-shrink-0" />
        <div className="flex-1">
          <p className="text-dash-ink text-sm font-semibold">
            {t('landingPagesList.creditsLine', { credits, creditsPlural: credits !== 1 ? 's' : '', pages: pagesRemaining, pagesPlural: pagesRemaining !== 1 ? 's' : '' })}
          </p>
          <p className="text-dash-ink-soft text-xs mt-0.5">{t('landingPagesList.creditsHint', { cost: CREDITS_PER_PAGE })}</p>
        </div>
        {!canCreate && (
          <Link href="/dashboard/billing" className="text-xs text-dash-accent hover:text-dash-accent-dark transition-colors whitespace-nowrap font-semibold">
            {t('landingPagesList.topUp')}
          </Link>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-dash-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : pages.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 gap-4">
          <FileText size={40} className="text-dash-ink-faint" />
          <div className="text-center">
            <p className="text-dash-ink-soft font-medium">{t('landingPagesList.emptyTitle')}</p>
            <p className="text-dash-ink-faint text-sm mt-1">{t('landingPagesList.emptyHint')}</p>
          </div>
          {canCreate && (
            <Link href="/dashboard/pages/new" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-dash-accent-soft text-dash-accent-dark text-sm hover:opacity-80 transition-all font-semibold">
              <Sparkles size={14} /> {t('landingPagesList.generateFirstPage')}
            </Link>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pages.map((page, i) => (
            <Card key={page.id} hover delayMs={i * 50} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-dash-ink font-semibold truncate">{page.title}</p>
                  <p className="text-dash-ink-faint text-xs mt-0.5 font-mono truncate">{page.slug}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${page.is_active ? 'bg-dash-success-soft text-dash-success' : 'bg-dash-surface-2 text-dash-ink-faint'}`}>
                  {page.is_active ? t('landingPagesList.statusActive') : t('landingPagesList.statusInactive')}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-dash-ink-soft">
                <span>{t('landingPagesList.views', { count: page.views })}</span>
                <span>{t('landingPagesList.orders', { count: page.orders_count })}</span>
              </div>
              <div className="flex items-center gap-1.5 pt-1 border-t border-dash-border">
                <Link href={`/dashboard/pages/${page.id}`} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-dash-ink-soft hover:text-dash-ink hover:bg-dash-surface-2 transition-all">
                  <Pencil size={12} /> {t('landingPagesList.edit')}
                </Link>
                <a href={getPublicUrl(page.slug)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-dash-ink-soft hover:text-dash-ink hover:bg-dash-surface-2 transition-all">
                  <ExternalLink size={12} /> {t('landingPagesList.view')}
                </a>
                <button onClick={() => copyLink(page)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-dash-ink-soft hover:text-dash-ink hover:bg-dash-surface-2 transition-all">
                  {copiedId === page.id ? <Check size={12} className="text-dash-success" /> : <Copy size={12} />}
                  {copiedId === page.id ? t('landingPagesList.copied') : t('landingPagesList.copy')}
                </button>
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
