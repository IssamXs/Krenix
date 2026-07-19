'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { FileText, Lock, Sparkles, Pencil, Copy, Trash2, ExternalLink, Check, Image as ImageIcon, Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { LandingPage, Store, AdCreative } from '@/types/database'
import { AD_CREATIVE_FORMAT_LABELS as FORMAT_LABELS, AD_CREATIVE_STYLE_LABELS as STYLE_LABELS } from '@/types/database'
import Card from '@/components/dashboard/ui/Card'

export default function PagesPage() {
  const [pages, setPages] = useState<LandingPage[]>([])
  const [store, setStore] = useState<Store | null>(null)
  const [adCreatives, setAdCreatives] = useState<AdCreative[]>([])
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
      const [pagesRes, creativesRes] = await Promise.all([
        supabase.from('landing_pages').select('*').eq('store_id', storeData.id).order('created_at', { ascending: false }),
        supabase.from('ad_creatives').select('*').eq('store_id', storeData.id).order('created_at', { ascending: false }).limit(20),
      ])
      setPages((pagesRes.data ?? []) as LandingPage[])
      setAdCreatives((creativesRes.data ?? []) as AdCreative[])
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
    if (!confirm(`Supprimer "${page.title}" ? Cette action est irréversible.`)) return
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
          <div className="text-[11px] tracking-[0.09em] uppercase text-dash-accent font-bold">Boutique en ligne</div>
          <h1 className="dash-font-heading font-medium text-[32px] mt-1 text-dash-ink">Landing Pages</h1>
        </div>
        {canCreate ? (
          <Link href="/dashboard/pages/new" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[11px] bg-dash-accent text-dash-surface font-bold text-sm hover:bg-dash-accent-dark transition-all">
            <Sparkles size={16} /> Générer avec l&apos;IA
          </Link>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-[11px] bg-dash-surface-2 border border-dash-border text-dash-ink-faint text-sm">
            <Lock size={14} /> Plus de crédits
          </div>
        )}
      </motion.div>

      <div className="bg-dash-accent-soft/50 border border-dash-accent/20 rounded-xl p-4 flex items-center gap-3">
        <Sparkles size={18} className="text-dash-accent flex-shrink-0" />
        <div className="flex-1">
          <p className="text-dash-ink text-sm font-semibold">
            {credits} crédit{credits !== 1 ? 's' : ''} IA · {pagesRemaining} page{pagesRemaining !== 1 ? 's' : ''} restante{pagesRemaining !== 1 ? 's' : ''}
          </p>
          <p className="text-dash-ink-soft text-xs mt-0.5">{CREDITS_PER_PAGE} crédits = 1 landing page générée par l&apos;IA</p>
        </div>
        {!canCreate && (
          <Link href="/dashboard/billing" className="text-xs text-dash-accent hover:text-dash-accent-dark transition-colors whitespace-nowrap font-semibold">
            Recharger →
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
            <p className="text-dash-ink-soft font-medium">Aucune landing page</p>
            <p className="text-dash-ink-faint text-sm mt-1">Créez votre première page avec l&apos;IA pour augmenter vos conversions</p>
          </div>
          {canCreate && (
            <Link href="/dashboard/pages/new" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-dash-accent-soft text-dash-accent-dark text-sm hover:opacity-80 transition-all font-semibold">
              <Sparkles size={14} /> Générer ma première page
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
                  {page.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-dash-ink-soft">
                <span>{page.views} vues</span>
                <span>{page.orders_count} commandes</span>
              </div>
              <div className="flex items-center gap-1.5 pt-1 border-t border-dash-border">
                <Link href={`/dashboard/pages/${page.id}`} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-dash-ink-soft hover:text-dash-ink hover:bg-dash-surface-2 transition-all">
                  <Pencil size={12} /> Modifier
                </Link>
                <a href={getPublicUrl(page.slug)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-dash-ink-soft hover:text-dash-ink hover:bg-dash-surface-2 transition-all">
                  <ExternalLink size={12} /> Voir
                </a>
                <button onClick={() => copyLink(page)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-dash-ink-soft hover:text-dash-ink hover:bg-dash-surface-2 transition-all">
                  {copiedId === page.id ? <Check size={12} className="text-dash-success" /> : <Copy size={12} />}
                  {copiedId === page.id ? 'Copié !' : 'Copier'}
                </button>
                <button onClick={() => deletePage(page)} disabled={deletingId === page.id} className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-dash-danger/60 hover:text-dash-danger hover:bg-dash-danger-soft transition-all disabled:opacity-50">
                  <Trash2 size={12} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {adCreatives.length > 0 && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2">
            <ImageIcon size={16} className="text-dash-gold-dark" />
            <h3 className="text-dash-ink font-bold">Publicités générées</h3>
            <span className="text-xs text-dash-ink-soft bg-dash-surface-2 px-2 py-0.5 rounded-full">{adCreatives.length}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {adCreatives.map(creative => (
              <div key={creative.id} className="bg-dash-surface border border-dash-border rounded-xl overflow-hidden group hover:border-dash-ink-faint transition-all">
                <div className="relative aspect-square overflow-hidden bg-dash-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={creative.image_url} alt={creative.product_name} loading="lazy" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <a href={creative.image_url} download={`pub-${creative.product_name}-${creative.format}.png`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-black text-xs font-bold">
                      <Download size={12} /> Télécharger
                    </a>
                  </div>
                  <div className="absolute top-2 left-2 flex gap-1">
                    <span className="text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded font-medium">{FORMAT_LABELS[creative.format]}</span>
                    <span className="text-[10px] bg-dash-gold text-dash-ink px-1.5 py-0.5 rounded font-bold">{STYLE_LABELS[creative.style]}</span>
                  </div>
                </div>
                <div className="p-2.5">
                  <p className="text-dash-ink text-xs font-semibold truncate">{creative.product_name}</p>
                  {creative.ad_copy && <p className="text-dash-ink-faint text-[10px] mt-0.5 truncate">{creative.ad_copy.split('\n')[0]}</p>}
                  <p className="text-dash-ink-faint text-[10px] mt-1">{new Date(creative.created_at).toLocaleDateString('fr-DZ', { day: '2-digit', month: 'short' })}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
