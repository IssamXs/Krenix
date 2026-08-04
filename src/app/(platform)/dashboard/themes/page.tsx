'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { Store } from '@/types/database'
import { Lock, Check, Loader2, ExternalLink, Eye } from 'lucide-react'
import { requestCacheRevalidate } from '@/lib/cache/revalidate-client'
import { useI18n } from '@/lib/i18n/LocaleProvider'

// Plans that unlock ALL niche themes (Pro can pick exactly one — handled per-card).
const ULTIMATE_PLANS = ['ultimate', 'growth', 'business', 'agency', 'enterprise', 'sur_mesure']

// All theme demos use the /theme-preview/[slug] route which renders a polished
// demo storefront with hardcoded content — no database lookup needed.
function demoStoreHref(themeSlug: string): string {
  return `/theme-preview/${themeSlug}`
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

// ─── Big theme preview card ────────────────────────────────────────────────────
// Niche themes embed the real /theme-preview/[slug] page in a scaled-down iframe
// (genuine demo content, always in sync with the actual theme — no separate fake
// preview data to drift). Generic themes have no demo page, so they reuse the
// original illustrated mockup, uniformly scaled up to fill the same big frame.
const PREVIEW_HEIGHT = 420
// The mockup was designed at a 168px-tall canvas — scale it up uniformly to fill
// the new bigger frame without rewriting every inline pixel value.
const MOCKUP_DESIGN_HEIGHT = 168
const MOCKUP_SCALE = PREVIEW_HEIGHT / MOCKUP_DESIGN_HEIGHT
// The "oversized iframe + scale-down" trick: the iframe's layout width is a
// multiple of the container's actual width (whatever that ends up being at any
// breakpoint), so it always renders the demo page's desktop layout, cropped to
// PREVIEW_HEIGHT — regardless of how wide the card itself is.
const IFRAME_ZOOM = 2.5
const IFRAME_SCALE = 1 / IFRAME_ZOOM

function ThemePreviewCard({
  theme, isActive, isLocked, lockLabel = 'Pro', previewable, previewHref, onSelect,
}: {
  theme: typeof NICHE_THEMES[0] | typeof GENERIC_THEMES[0]
  isActive: boolean
  isLocked: boolean
  lockLabel?: string
  previewable: boolean
  previewHref?: string
  onSelect: () => void
}) {
  const { t } = useI18n()
  const p = theme.preview
  const shadowColor = p.accent + '40'
  const resolvedPreviewHref = previewHref ?? `/theme-preview/${theme.slug}`

  return (
    <div
      className={`relative rounded-3xl overflow-hidden transition-all duration-300 ${
        isLocked ? 'cursor-not-allowed' : 'cursor-pointer'
      } ${isActive ? 'ring-2' : 'hover:-translate-y-0.5 hover:shadow-xl'}`}
      style={{
        boxShadow: isActive ? `0 0 0 2px ${p.accent}` : '0 2px 16px rgba(0,0,0,0.16)',
      }}
      onClick={() => !isLocked && onSelect()}
    >
      {/* ── Visual preview ── */}
      <div style={{ background: p.bg, height: PREVIEW_HEIGHT, position: 'relative', overflow: 'hidden' }}>

        {previewable ? (
          /* Real live demo page, zoomed out to show the full desktop layout */
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: `${IFRAME_ZOOM * 100}%`, height: `${PREVIEW_HEIGHT * IFRAME_ZOOM}px`,
            transform: `scale(${IFRAME_SCALE})`, transformOrigin: 'top left',
          }}>
            <iframe
              src={resolvedPreviewHref}
              title={theme.name}
              loading="lazy"
              tabIndex={-1}
              style={{ width: '100%', height: '100%', border: 'none', overflow: 'hidden', pointerEvents: 'none' }}
            />
          </div>
        ) : (
          /* Illustrated mockup (no live demo page for generic themes), scaled up */
          <div style={{
            width: `${(MOCKUP_DESIGN_HEIGHT / PREVIEW_HEIGHT) * 100}%`,
            height: MOCKUP_DESIGN_HEIGHT,
            transform: `scale(${MOCKUP_SCALE})`, transformOrigin: 'top left',
            position: 'relative',
          }}>
            {/* Fake product image area */}
            <div style={{
              position: 'absolute', right: 16, top: 16, bottom: 16, width: '42%',
              background: p.card, borderRadius: 10,
              border: `1px solid ${p.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 12 }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, background: p.accent }} />
                <div style={{ width: 48, height: 5, borderRadius: 3, background: p.text + '50' }} />
              </div>

              <div style={{ width: '85%', height: 8, borderRadius: 4, background: p.text + '90', marginBottom: 5, fontFamily: p.fontDisplay }} />
              <div style={{ width: '65%', height: 6, borderRadius: 3, background: p.text + '50', marginBottom: 10 }} />

              <div style={{
                fontSize: 8, fontWeight: 700, color: p.accent,
                fontFamily: p.fontDisplay, letterSpacing: 1, marginBottom: 10,
                textTransform: 'uppercase', opacity: 0.85,
              }}>
                {p.tagline}
              </div>

              <div style={{
                display: 'inline-block', padding: '5px 12px',
                background: p.accent, borderRadius: 6,
                fontSize: 8, fontWeight: 700, color: p.badgeText,
              }}>
                {t('themes.order')}
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
              <div style={{ width: 40, height: 6, borderRadius: 3, background: p.accent + '50' }} />
            </div>
          </div>
        )}

        {/* Bottom fade into the info panel */}
        <div className="absolute inset-x-0 bottom-0 h-16 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent, var(--color-dash-surface))' }} />

        {/* ── Lock chip — the design stays FULLY visible (no veil) ── */}
        {isLocked && (
          <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
            <Lock size={12} className="text-white/80" />
            <span className="text-white text-xs font-bold">{lockLabel}</span>
          </div>
        )}

        {/* ── Active badge ── */}
        {isActive && (
          <div className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center shadow-lg"
            style={{ background: p.accent, boxShadow: `0 0 12px ${shadowColor}` }}>
            <Check size={16} style={{ color: p.badgeText }} />
          </div>
        )}
      </div>

      {/* ── Info + actions ── */}
      <div className="px-6 py-5 bg-dash-surface border-t border-dash-border space-y-4">
        <div>
          <p className="dash-font-heading font-medium text-lg text-dash-ink leading-tight">{theme.name}</p>
          <p className="text-sm mt-1 leading-tight text-dash-ink-soft">{theme.niche}</p>
        </div>

        <div className="flex items-center gap-2.5">
          {previewable && (
            <a
              href={resolvedPreviewHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              title={t('themes.fullScreenPreview')}
              className="flex items-center justify-center w-11 h-11 flex-shrink-0 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint/40 transition-colors"
            >
              <Eye size={17} />
            </a>
          )}

          {isLocked ? (
            <a href="/dashboard/billing/upgrade"
              onClick={e => e.stopPropagation()}
              className="flex-1 flex items-center justify-center gap-1.5 text-sm font-bold px-4 py-3 rounded-xl transition-all hover:opacity-90 bg-dash-accent-soft text-dash-accent">
              <Lock size={13} /> {t('themes.seePlans')}
            </a>
          ) : isActive ? (
            <div className="flex-1 flex items-center justify-center gap-1.5 text-sm font-bold px-4 py-3 rounded-xl"
              style={{ background: `${p.accent}18`, color: p.accent }}>
              <Check size={14} /> {t('themes.active')}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm font-bold px-4 py-3 rounded-xl transition-all hover:opacity-90 text-white"
              style={{ background: p.accent }}>
              {t('themes.choose')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ThemesPage() {
  const { t } = useI18n()
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

    // Server-verifies the plan against the theme's tier_required — the client
    // check below only controls the button's clickability, it's not a security
    // boundary (a locked theme could otherwise be applied via a raw API call).
    const res = await fetch('/api/store/theme', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }),
    })
    if (res.ok) {
      requestCacheRevalidate('store') // storefront serves store+theme from a short-TTL cache
      setActiveSlug(slug)
      // Pro locks into its first niche choice — reflect it immediately so the
      // other niche cards lock without a reload. (Generic themes have tier basic
      // and never set this; Ultimate+ ignores it.)
      const isNiche = NICHE_THEMES.some(t => t.slug === slug)
      if (isNiche && store.plan === 'pro') {
        setStore(s => (s && !(s as { pro_theme_slug?: string | null }).pro_theme_slug
          ? { ...s, pro_theme_slug: slug } as Store
          : s))
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }, [store])

  const plan = store?.plan ?? 'basic'
  const isUltimatePlan = ULTIMATE_PLANS.includes(plan)
  const isProOnly = plan === 'pro'
  const proLocked = (store as { pro_theme_slug?: string | null } | null)?.pro_theme_slug ?? null

  // A niche theme's locked state under the "Pro picks one forever" model:
  //   • Ultimate+ → never locked (all 5).
  //   • Pro       → locked only once they've committed to a DIFFERENT niche.
  //   • Basic     → always locked.
  const nicheLocked = (themeSlug: string): boolean => {
    if (isUltimatePlan) return false
    if (isProOnly) return proLocked !== null && proLocked !== themeSlug
    return true
  }
  // Basic users need Pro to unlock; Pro users who've locked a choice need Ultimate to change.
  const nicheLockLabel = isProOnly ? 'Ultimate' : 'Pro'

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-dash-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-6xl space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">{t('themes.title')}</h1>
          <p className="text-dash-ink-soft text-sm mt-1">
            {t('themes.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-dash-success bg-dash-success-soft border border-dash-success/20 px-3 py-1.5 rounded-xl">
              <Check size={13} /> {t('themes.themeApplied')}
            </span>
          )}
          {saving && (
            <span className="flex items-center gap-1.5 text-sm text-dash-ink-soft">
              <Loader2 size={13} className="animate-spin" /> {t('themes.saving')}
            </span>
          )}
          {store?.slug && (
            <a
              href={process.env.NODE_ENV === 'production'
                ? `https://${store.slug}.krenix.store`
                : `/store?store=${store.slug}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-dash-ink-soft hover:text-dash-ink transition-colors px-3 py-2 rounded-xl border border-dash-border hover:border-dash-ink-faint/40"
            >
              <ExternalLink size={13} /> {t('themes.viewMyStore')}
            </a>
          )}
        </div>
      </div>

      {/* ── Niche Themes ─────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h3 className="text-dash-ink font-semibold">{t('themes.nicheThemes')}</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-dash-gold-soft text-dash-gold-dark border border-dash-gold/20 font-semibold">
            {t('themes.newBadge')}
          </span>
        </div>
        <p className="text-dash-ink-soft text-xs -mt-1">
          {t('themes.nicheThemesHint')}
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {NICHE_THEMES.map(theme => (
            <ThemePreviewCard
              key={theme.slug}
              theme={theme}
              isActive={activeSlug === theme.slug}
              isLocked={nicheLocked(theme.slug)}
              lockLabel={nicheLockLabel}
              previewable={true}
              previewHref={demoStoreHref(theme.slug)}
              onSelect={() => applyTheme(theme.slug)}
            />
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="border-t border-dash-border" />

      {/* ── Generic Themes ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-dash-ink font-semibold">{t('themes.universalThemes')}</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
        <div className="rounded-[20px] p-5 flex items-center gap-4 bg-dash-accent-soft border border-dash-accent/20">
          <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center bg-dash-accent/15">
            <Lock size={18} className="text-dash-accent" />
          </div>
          <div className="flex-1 min-w-0">
            {isProOnly ? (
              <>
                <p className="text-dash-ink font-semibold text-sm">
                  {proLocked ? t('themes.upgradeProLockedTitle') : t('themes.upgradeProChooseNiche')}
                </p>
                <p className="text-dash-ink-soft text-xs mt-0.5">
                  {proLocked ? t('themes.upgradeProLockedHint') : t('themes.upgradeProHint')}
                </p>
              </>
            ) : (
              <>
                <p className="text-dash-ink font-semibold text-sm">{t('themes.upgradeGeneric')}</p>
                <p className="text-dash-ink-soft text-xs mt-0.5">{t('themes.upgradeGenericHint')}</p>
              </>
            )}
          </div>
          <a href="/dashboard/billing/upgrade"
            className="flex-shrink-0 text-xs font-bold px-4 py-2.5 rounded-xl transition-all hover:opacity-90 bg-dash-accent text-white">
            {t('themes.seePlans')}
          </a>
        </div>
      )}

    </div>
  )
}
