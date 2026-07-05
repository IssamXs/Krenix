'use client'

import Link from 'next/link'
import { FileText, Lock, Sparkles, Pencil, Copy, Trash2, ExternalLink, Check, Image as ImageIcon, Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { LandingPage, Store, AdCreative } from '@/types/database'
import { AD_CREATIVE_FORMAT_LABELS as FORMAT_LABELS, AD_CREATIVE_STYLE_LABELS as STYLE_LABELS } from '@/types/database'

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
      ? `https://${store.slug}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'novalux.com'}/p/${pageSlug}`
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

  // A landing page generation costs 5 credits (enforced server-side in /api/ai/landing-page).
  const CREDITS_PER_PAGE = 5
  const credits = store?.ai_credits ?? 0
  const canCreate = credits >= CREDITS_PER_PAGE
  const pagesRemaining = Math.floor(credits / CREDITS_PER_PAGE)

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Landing Pages</h2>
          <p className="text-gray-500 text-sm mt-1">Créez des pages produit qui convertissent avec l&apos;IA</p>
        </div>
        {canCreate ? (
          <Link
            href="/dashboard/pages/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-black font-semibold text-sm hover:opacity-90 transition-all"
          >
            <Sparkles size={16} />
            Générer avec l&apos;IA
          </Link>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-500 text-sm">
            <Lock size={14} />
            Plus de crédits
          </div>
        )}
      </div>

      {/* Credits info */}
      <div className="bg-[#3B82F6]/5 border border-[#3B82F6]/20 rounded-xl p-4 flex items-center gap-3">
        <Sparkles size={18} className="text-[#3B82F6] flex-shrink-0" />
        <div className="flex-1">
          <p className="text-white text-sm font-medium">
            {credits} crédit{credits !== 1 ? 's' : ''} IA · {pagesRemaining} page{pagesRemaining !== 1 ? 's' : ''} restante{pagesRemaining !== 1 ? 's' : ''}
          </p>
          <p className="text-gray-500 text-xs mt-0.5">{CREDITS_PER_PAGE} crédits = 1 landing page générée par l&apos;IA</p>
        </div>
        {!canCreate && (
          <Link href="/dashboard/billing" className="text-xs text-[#3B82F6] hover:text-[#93C5FD] transition-colors whitespace-nowrap font-medium">
            Recharger →
          </Link>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-[#111118] border border-white/5 rounded-2xl">
          <FileText size={40} className="text-gray-600" />
          <div className="text-center">
            <p className="text-gray-400 font-medium">Aucune landing page</p>
            <p className="text-gray-600 text-sm mt-1">Créez votre première page avec l&apos;IA pour augmenter vos conversions</p>
          </div>
          {canCreate && (
            <Link href="/dashboard/pages/new" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3B82F6]/10 border border-[#3B82F6]/20 text-[#3B82F6] text-sm hover:bg-[#3B82F6]/20 transition-all">
              <Sparkles size={14} />
              Générer ma première page
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pages.map(page => (
            <div key={page.id} className="bg-[#111118] border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white font-medium truncate">{page.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5 font-mono truncate">{page.slug}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${page.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-500'}`}>
                  {page.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>{page.views} vues</span>
                <span>{page.orders_count} commandes</span>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
                <Link
                  href={`/dashboard/pages/${page.id}`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                >
                  <Pencil size={12} />
                  Modifier
                </Link>
                <a
                  href={getPublicUrl(page.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                >
                  <ExternalLink size={12} />
                  Voir
                </a>
                <button
                  onClick={() => copyLink(page)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                >
                  {copiedId === page.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  {copiedId === page.id ? 'Copié !' : 'Copier'}
                </button>
                <button
                  onClick={() => deletePage(page)}
                  disabled={deletingId === page.id}
                  className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-red-500/60 hover:text-red-400 hover:bg-red-500/5 transition-all disabled:opacity-50"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ad Creatives Gallery */}
      {adCreatives.length > 0 && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2">
            <ImageIcon size={16} className="text-[#F59E0B]" />
            <h3 className="text-white font-semibold">Publicités générées</h3>
            <span className="text-xs text-gray-600 bg-white/5 px-2 py-0.5 rounded-full">{adCreatives.length}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {adCreatives.map(creative => (
              <div key={creative.id} className="bg-[#111118] border border-white/5 rounded-xl overflow-hidden group hover:border-white/10 transition-all">
                <div className="relative aspect-square overflow-hidden bg-black/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={creative.image_url}
                    alt={creative.product_name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <a
                      href={creative.image_url}
                      download={`pub-${creative.product_name}-${creative.format}.png`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-black text-xs font-bold"
                    >
                      <Download size={12} />
                      Télécharger
                    </a>
                  </div>
                  <div className="absolute top-2 left-2 flex gap-1">
                    <span className="text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded font-medium">
                      {FORMAT_LABELS[creative.format]}
                    </span>
                    <span className="text-[10px] bg-[#F59E0B]/80 text-black px-1.5 py-0.5 rounded font-bold">
                      {STYLE_LABELS[creative.style]}
                    </span>
                  </div>
                </div>
                <div className="p-2.5">
                  <p className="text-white text-xs font-semibold truncate">{creative.product_name}</p>
                  {creative.ad_copy && (
                    <p className="text-gray-600 text-[10px] mt-0.5 truncate">{creative.ad_copy.split('\n')[0]}</p>
                  )}
                  <p className="text-gray-700 text-[10px] mt-1">
                    {new Date(creative.created_at).toLocaleDateString('fr-DZ', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
