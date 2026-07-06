'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { Store } from '@/types/database'
import { Lock, Check, Loader2, ExternalLink } from 'lucide-react'

// Plans that unlock niche themes
const PRO_PLANS    = ['pro', 'ultimate', 'growth', 'business', 'agency', 'enterprise', 'sur_mesure']
const ULTIMATE_PLANS = ['ultimate', 'growth', 'business', 'agency', 'enterprise', 'sur_mesure']

// Theme slug -> populated demo store slug (real products, real theme template)
const DEMO_STORE_SLUGS: Record<string, string> = {
  'beauty-fashion': 'demo-beaute',
  'tech-mobile': 'demo-tech',
  'fitness-wellness': 'demo-fitness',
  'auto-accessories': 'demo-auto',
  'home-lifestyle': 'demo-maison',
}

function demoStoreHref(themeSlug: string): string {
  const demoSlug = DEMO_STORE_SLUGS[themeSlug]
  if (!demoSlug) return `/theme-preview/${themeSlug}`
  return process.env.NODE_ENV === 'production'
    ? `https://${demoSlug}.krenix.com`
    : `/store?store=${demoSlug}`
}

// ─── Theme visual configs ─────────────────────────────────────────────────────
// Each entry mirrors the DB row + provides preview-specific CSS data
// Preview aesthetics mirror Database/014_premium_themes.sql (real premium tokens).
const NICHE_THEMES = [
  {
    slug: 'beauty-fashion',
    name: 'Beauty & Fashion',
    niche: 'Mode • Beauté • Cosmétiques',
    free: false,
    tier: 'pro' as const,
    // Soft romantic luxury: blush + coral, elegant serif
    preview: {
      bg: '#FDEEEE',
      card: '#FFFFFF',
      accent: '#E85D5D',
      text: '#1A1A1A',
      textMuted: '#6B5D5A',
      border: 'rgba(232,93,93,0.14)',
      fontDisplay: '"Cormorant Garamond", Georgia, serif',
      tagline: 'La beauté, révélée',
      badge: '#E85D5D',
      badgeText: '#fff',
      light: true,
    },
  },
  {
    slug: 'auto-accessories',
    name: 'Auto Accessories',
    niche: 'Pièces auto • Tuning • Entretien',
    free: false,
    tier: 'ultimate' as const,
    // Bold automotive: high-contrast light + aggressive red
    preview: {
      bg: '#F4F4F4',
      card: '#FFFFFF',
      accent: '#E62E2D',
      text: '#111111',
      textMuted: '#6B6B6B',
      border: 'rgba(0,0,0,0.09)',
      fontDisplay: '"Barlow Condensed", Impact, sans-serif',
      tagline: 'ÉQUIPE TA MACHINE',
      badge: '#E62E2D',
      badgeText: '#fff',
      light: true,
    },
  },
  {
    slug: 'fitness-wellness',
    name: 'Fitness & Wellness',
    niche: 'Sport • Musculation • Bien-être',
    free: false,
    tier: 'ultimate' as const,
    // Dark athletic + electric lime
    preview: {
      bg: '#141414',
      card: '#1C1C1C',
      accent: '#DFFF3A',
      text: '#FFFFFF',
      textMuted: '#8F8F8F',
      border: 'rgba(223,255,58,0.18)',
      fontDisplay: '"Barlow Condensed", Arial Black, sans-serif',
      tagline: 'PLUS FORT CHAQUE JOUR',
      badge: '#DFFF3A',
      badgeText: '#111',
      light: false,
    },
  },
  {
    slug: 'home-lifestyle',
    name: 'Home & Lifestyle',
    niche: 'Maison • Déco • Art de vivre',
    free: false,
    tier: 'ultimate' as const,
    // Warm minimal lifestyle: off-white + terracotta
    preview: {
      bg: '#F5F5F2',
      card: '#FFFFFF',
      accent: '#FF5B2E',
      text: '#1A1A1A',
      textMuted: '#6B6B6B',
      border: 'rgba(0,0,0,0.07)',
      fontDisplay: '"Sora", system-ui, sans-serif',
      tagline: 'Vivre avec style',
      badge: '#FF5B2E',
      badgeText: '#fff',
      light: true,
    },
  },
  {
    slug: 'tech-mobile',
    name: 'Tech & Mobile',
    niche: 'Téléphonie • Accessoires • Gadgets',
    free: false,
    tier: 'ultimate' as const,
    // Clean minimal tech: white + lime green
    preview: {
      bg: '#FFFFFF',
      card: '#F5F5F5',
      accent: '#8BC34A',
      text: '#1A1A1A',
      textMuted: '#6B7280',
      border: 'rgba(0,0,0,0.08)',
      fontDisplay: '"Poppins", system-ui, sans-serif',
      tagline: 'Smart. Rapide. Moderne.',
      badge: '#8BC34A',
      badgeText: '#111',
      light: true,
    },
  },
]

// ─── Existing generic themes ──────────────────────────────────────────────────
const GENERIC_THEMES = [
  {
    slug: 'classique',
    name: 'Krenix Dark',
    niche: 'Universel — thème par défaut',
    free: true,
    tier: 'basic' as const,
    preview: {
      bg: '#0A0A0F', card: '#111118', accent: '#F59E0B',
      text: '#FFF', textMuted: '#9CA3AF', border: 'rgba(255,255,255,0.1)',
      fontDisplay: 'system-ui, sans-serif', tagline: 'Propulsé par Krenix',
      badge: '#F59E0B', badgeText: '#000', light: false,
    },
  },
  {
    slug: 'sombre',
    name: 'Sombre',
    niche: 'Universel — minimaliste noir',
    free: true,
    tier: 'basic' as const,
    preview: {
      bg: '#000000', card: '#0D0D0D', accent: '#FFFFFF',
      text: '#FFF', textMuted: '#666', border: 'rgba(255,255,255,0.08)',
      fontDisplay: 'system-ui, sans-serif', tagline: 'Less is more',
      badge: '#FFFFFF', badgeText: '#000', light: false,
    },
  },
  {
    slug: 'chaleureux',
    name: 'Chaleureux',
    niche: 'Universel — tons chauds ambrés',
    free: true,
    tier: 'basic' as const,
    preview: {
      bg: '#1A1209', card: '#241A0E', accent: '#D97706',
      text: '#FEF3C7', textMuted: '#D97706', border: 'rgba(217,119,6,0.2)',
      fontDisplay: 'Georgia, serif', tagline: 'Authenticité & Chaleur',
      badge: '#D97706', badgeText: '#fff', light: false,
    },
  },
]

// ─── Mini store preview card ──────────────────────────────────────────────────
function ThemePreviewCard({
  theme, isActive, isLocked, previewable, previewHref, onSelect,
}: {
  theme: typeof NICHE_THEMES[0] | typeof GENERIC_THEMES[0]
  isActive: boolean
  isLocked: boolean
  previewable: boolean
  previewHref?: string
  onSelect: () => void
}) {
  const p = theme.preview
  const shadowColor = p.accent + '40'

  return (
    <div
      className={`relative rounded-2xl overflow-hidden transition-all duration-300 group ${
        isLocked ? 'cursor-not-allowed' : 'cursor-pointer'
      } ${isActive ? 'ring-2 scale-[1.02]' : 'hover:scale-[1.01]'}`}
      style={{
        boxShadow: isActive ? `0 0 0 2px ${p.accent}` : '0 2px 12px rgba(0,0,0,0.2)',
      }}
      onClick={() => !isLocked && onSelect()}
    >
      {/* ── Visual preview ── */}
      <div style={{ background: p.bg, height: 168, position: 'relative', overflow: 'hidden' }}>

        {/* Fake product image area */}
        <div style={{
          position: 'absolute', right: 16, top: 16, bottom: 16, width: '42%',
          background: p.card, borderRadius: 10,
          border: `1px solid ${p.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {/* Simulated product block */}
          <div style={{ textAlign: 'center', padding: 8 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 8, margin: '0 auto 6px',
              background: `linear-gradient(135deg, ${p.accent}30, ${p.accent}10)`,
              border: `1px solid ${p.accent}30`,
            }} />
            <div style={{ width: 52, height: 6, borderRadius: 3, background: p.accent + '60', marginBottom: 4 }} />
            <div style={{ width: 36, height: 5, borderRadius: 3, background: p.textMuted + '40' }} />
          </div>
        </div>

        {/* Text content side */}
        <div style={{ padding: '18px 16px', width: '58%' }}>
          {/* Fake store name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 12 }}>
            <div style={{ width: 18, height: 18, borderRadius: 4, background: p.accent }} />
            <div style={{ width: 48, height: 5, borderRadius: 3, background: p.text + '50' }} />
          </div>

          {/* Headline lines */}
          <div style={{ width: '85%', height: 8, borderRadius: 4, background: p.text + '90', marginBottom: 5, fontFamily: p.fontDisplay }} />
          <div style={{ width: '65%', height: 6, borderRadius: 3, background: p.text + '50', marginBottom: 10 }} />

          {/* Tagline */}
          <div style={{
            fontSize: 8, fontWeight: 700, color: p.light ? p.accent : p.accent,
            fontFamily: p.fontDisplay, letterSpacing: 1, marginBottom: 10,
            textTransform: 'uppercase', opacity: 0.85,
          }}>
            {p.tagline}
          </div>

          {/* CTA button */}
          <div style={{
            display: 'inline-block', padding: '5px 12px',
            background: p.accent, borderRadius: 6,
            fontSize: 8, fontWeight: 700, color: p.badgeText,
          }}>
            Commander
          </div>
        </div>

        {/* Bottom product strip */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 36,
          background: p.card, borderTop: `1px solid ${p.border}`,
          display: 'flex', gap: 6, alignItems: 'center', padding: '0 12px',
        }}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              width: 24, height: 24, borderRadius: 5,
              background: `linear-gradient(135deg, ${p.accent}20, ${p.accent}08)`,
              border: `1px solid ${p.border}`,
              flexShrink: 0,
            }} />
          ))}
          <div style={{ flex: 1 }} />
          <div style={{
            width: 40, height: 6, borderRadius: 3,
            background: p.accent + '50',
          }} />
        </div>
      </div>

      {/* ── Info bar ── */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ background: '#111118', borderTop: `1px solid rgba(255,255,255,0.06)` }}>
        <div>
          <p className="text-white font-semibold text-sm leading-tight">{theme.name}</p>
          <p className="text-xs mt-0.5 leading-tight" style={{ color: '#6B7280' }}>{theme.niche}</p>
        </div>
        {isActive && (
          <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg"
            style={{ background: `${p.accent}20`, color: p.accent }}>
            <Check size={10} /> Actif
          </span>
        )}
        {!isActive && !isLocked && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: `${p.accent}15`, color: p.accent }}>
            Choisir
          </span>
        )}
        {isLocked && (
          <a href="/dashboard/billing/upgrade"
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg transition-all hover:opacity-90"
            style={{ background: 'rgba(59,130,246,0.15)', color: '#3B82F6' }}>
            <Lock size={10} /> Voir les plans
          </a>
        )}
      </div>

      {/* ── Full-screen preview button — open to EVERYONE (upgrade bait) ── */}
      {previewable && (
        <a
          href={previewHref ?? `/theme-preview/${theme.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition-all shadow-lg"
          style={{ top: 66, background: 'rgba(0,0,0,0.78)', color: '#fff', backdropFilter: 'blur(4px)' }}
        >
          <ExternalLink size={12} /> Aperçu plein écran
        </a>
      )}

      {/* ── Lock chip — the design stays FULLY visible (no veil) ── */}
      {isLocked && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
          <Lock size={11} className="text-white/80" />
          <span className="text-white text-[11px] font-bold">
            {theme.tier === 'ultimate' ? 'Ultimate' : 'Pro'}
          </span>
        </div>
      )}

      {/* ── Active ring ── */}
      {isActive && (
        <div className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center shadow-lg"
          style={{ background: p.accent, boxShadow: `0 0 12px ${shadowColor}` }}>
          <Check size={14} style={{ color: p.badgeText }} />
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ThemesPage() {
  const router = useRouter()
  const [store, setStore] = useState<Store | null>(null)
  const [activeSlug, setActiveSlug] = useState<string>('classique')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      try {
        const storeData = await resolveActiveStore(supabase, user.id) as Store | null
        if (!storeData) { router.push('/onboarding/step-1'); return }
        setStore(storeData)

        if ((storeData as { theme_id?: string | null }).theme_id) {
          const { data: themeData } = await supabase
            .from('themes')
            .select('slug')
            .eq('id', (storeData as { theme_id: string }).theme_id)
            .single()
          if (themeData) setActiveSlug(themeData.slug)
        }
      } finally {
        setLoading(false)
      }
    })
  }, [router])

  const applyTheme = useCallback(async (slug: string) => {
    if (!store) return
    setSaving(true)
    const supabase = createClient()

    // Fetch the theme id by slug
    const { data: theme } = await supabase.from('themes').select('id').eq('slug', slug).single()
    if (!theme) { setSaving(false); return }

    await supabase.from('stores').update({ theme_id: theme.id }).eq('id', store.id)
    setActiveSlug(slug)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }, [store])

  const plan = store?.plan ?? 'basic'
  const isProPlan     = PRO_PLANS.includes(plan)
  const isUltimatePlan = ULTIMATE_PLANS.includes(plan)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-5xl space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Thèmes</h2>
          <p className="text-gray-500 text-sm mt-1">
            Personnalisez l&apos;apparence de votre boutique selon votre niche
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-xl">
              <Check size={13} /> Thème appliqué !
            </span>
          )}
          {saving && (
            <span className="flex items-center gap-1.5 text-sm text-gray-400">
              <Loader2 size={13} className="animate-spin" /> Enregistrement...
            </span>
          )}
          {store?.slug && (
            <a
              href={process.env.NODE_ENV === 'production'
                ? `https://${store.slug}.krenix.com`
                : `/store?store=${store.slug}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-3 py-2 rounded-xl border border-white/10 hover:border-white/20"
            >
              <ExternalLink size={13} /> Voir ma boutique
            </a>
          )}
        </div>
      </div>

      {/* ── Niche Themes ─────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h3 className="text-white font-semibold">Thèmes par niche</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 font-semibold">
            Nouveau
          </span>
        </div>
        <p className="text-gray-500 text-xs -mt-1">
          Un thème conçu pour votre secteur d&apos;activité convertit mieux. Choisissez celui qui correspond à votre niche.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {NICHE_THEMES.map(theme => (
            <ThemePreviewCard
              key={theme.slug}
              theme={theme}
              isActive={activeSlug === theme.slug}
              isLocked={
                (theme.tier === 'pro'      && !isProPlan) ||
                (theme.tier === 'ultimate' && !isUltimatePlan)
              }
              previewable={true}
              previewHref={demoStoreHref(theme.slug)}
              onSelect={() => applyTheme(theme.slug)}
            />
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="border-t border-white/5" />

      {/* ── Generic Themes ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-white font-semibold">Thèmes universels</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {GENERIC_THEMES.map(theme => (
            <ThemePreviewCard
              key={theme.slug}
              theme={theme}
              isActive={activeSlug === theme.slug}
              isLocked={false}
              previewable={false}
              onSelect={() => applyTheme(theme.slug)}
            />
          ))}
        </div>
      </section>

      {/* Upsell banner */}
      {!isUltimatePlan && (
        <div className="rounded-2xl p-5 flex items-center gap-4"
          style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
          <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
            style={{ background: 'rgba(59,130,246,0.15)' }}>
            <Lock size={18} className="text-[#3B82F6]" />
          </div>
          <div className="flex-1 min-w-0">
            {isProPlan ? (
              <>
                <p className="text-white font-semibold text-sm">Débloquez 4 thèmes niches supplémentaires</p>
                <p className="text-gray-500 text-xs mt-0.5">Auto, Fitness, Maison & Lifestyle, Tech — disponibles avec le plan Ultimate</p>
              </>
            ) : (
              <>
                <p className="text-white font-semibold text-sm">Débloquez les thèmes par niche</p>
                <p className="text-gray-500 text-xs mt-0.5">Beauty & Fashion dès Pro — tous les 5 thèmes avec Ultimate</p>
              </>
            )}
          </div>
          <a href="/dashboard/billing/upgrade"
            className="flex-shrink-0 text-xs font-bold px-4 py-2.5 rounded-xl transition-all hover:opacity-90"
            style={{ background: '#3B82F6', color: '#fff' }}>
            Voir les plans
          </a>
        </div>
      )}

    </div>
  )
}
