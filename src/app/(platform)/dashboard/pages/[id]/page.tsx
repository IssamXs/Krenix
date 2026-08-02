'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { LandingPage, Store, LandingPageContent, LandingPageSectionKey, Plan } from '@/types/database'
import { BUSINESS_PLANS } from '@/types/database'
import { isSectionVisible } from '@/lib/landing-sections'
import { ensureLandingPageProduct } from '@/lib/publish-landing-page'
import { requestCacheRevalidate } from '@/lib/cache/revalidate-client'
import {
  ArrowLeft, ExternalLink, Copy, Check, Trash2, Loader2,
  ChevronDown, ChevronUp, Save, ToggleLeft, ToggleRight, Rocket,
  Lock, FlaskConical, Trophy, Plus
} from 'lucide-react'
import { getPhotoCount } from '@/lib/landing-photos'

// -------------------------------------------------------
// Small reusable field components
// -------------------------------------------------------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs text-dash-ink-soft uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm"
    />
  )
}

function TextArea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm resize-none"
    />
  )
}

function Section({ title, children, defaultOpen = true, hidden = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean; hidden?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`bg-dash-surface border border-dash-border rounded-[20px] overflow-hidden transition-opacity ${hidden ? 'opacity-60' : ''}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-dash-surface-2 transition-colors"
      >
        <span className="flex items-center gap-2 text-dash-ink font-semibold text-sm">
          {title}
          {hidden && (
            <span className="px-2 py-0.5 rounded-full bg-dash-surface-2 text-dash-ink-faint text-[10px] font-medium normal-case">
              Section masquée
            </span>
          )}
        </span>
        {open ? <ChevronUp size={16} className="text-dash-ink-soft" /> : <ChevronDown size={16} className="text-dash-ink-soft" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4 border-t border-dash-border pt-4">{children}</div>}
    </div>
  )
}

const SECTION_TOGGLES: { key: LandingPageSectionKey; label: string }[] = [
  { key: 'benefits', label: 'Avantages' },
  { key: 'social_proof', label: 'Preuves sociales' },
  { key: 'product_details', label: 'Détails produit' },
  { key: 'urgency', label: 'Urgence' },
  { key: 'trust_bar', label: 'Barre de confiance' },
  { key: 'recent_clients', label: 'Clients récents (Ultimate)' },
  { key: 'lead_capture', label: 'Formulaire de rappel' },
  { key: 'sticky_cta', label: 'Barre CTA mobile (Pro+)' },
]

// -------------------------------------------------------
// Main page
// -------------------------------------------------------
export default function EditLandingPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [page, setPage] = useState<LandingPage | null>(null)
  const [store, setStore] = useState<Store | null>(null)
  const [content, setContent] = useState<LandingPageContent | null>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [title, setTitle] = useState('')
  const [isActive, setIsActive] = useState(true)
  // Stock: '' = not tracked (null in DB), otherwise integer >= 0
  const [stock, setStock] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  // Upsell
  const [upsellEnabled, setUpsellEnabled] = useState(false)
  const [upsellProductName, setUpsellProductName] = useState('')
  const [upsellText, setUpsellText] = useState('')
  const [upsellPrice, setUpsellPrice] = useState('')
  // A/B testing (Business+)
  const [contentB, setContentB] = useState<LandingPageContent | null>(null)
  const [viewsB, setViewsB] = useState(0)
  const [variantOrders, setVariantOrders] = useState<{ A: number; B: number }>({ A: 0, B: 0 })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const storeData = await resolveActiveStore(supabase, user.id) as Store | null
      if (!storeData) { router.push('/onboarding/step-1'); return }
      // Credits are a shared account pool (primary store): plan allowance + purchased.
      const { data: primary } = await supabase
        .from('stores').select('ai_credits, purchased_credits')
        .eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      const pooled = ((primary?.ai_credits as number | undefined) ?? storeData.ai_credits ?? 0)
        + ((primary?.purchased_credits as number | undefined) ?? 0)
      setStore({ ...storeData, ai_credits: pooled })

      const { data: pageData } = await supabase.from('landing_pages').select('*').eq('id', id).eq('store_id', storeData.id).single()
      if (!pageData) { router.push('/dashboard/pages'); return }
      const lp = pageData as LandingPage
      setPage(lp)
      setContent(lp.content)
      setPhotos(lp.generated_images ?? [])
      setTitle(lp.title)
      setIsActive(lp.is_active)
      setStock(lp.stock === null || lp.stock === undefined ? '' : String(lp.stock))
      setUpsellEnabled(lp.upsell_enabled ?? false)
      setUpsellProductName(lp.upsell_product_name ?? '')
      setUpsellText(lp.upsell_text ?? '')
      setUpsellPrice(lp.upsell_price ? String(lp.upsell_price) : '')
      setContentB(lp.content_b ?? null)
      setViewsB(lp.views_b ?? 0)
      // Per-variant order counts for the A/B comparison (untagged orders ignored).
      const { data: ordersV } = await supabase.from('orders').select('variant').eq('landing_page_id', lp.id)
      const vo = { A: 0, B: 0 }
      for (const o of ordersV ?? []) { if (o.variant === 'B') vo.B++; else if (o.variant === 'A') vo.A++ }
      setVariantOrders(vo)

      // When linked to a product, the product owns the stock — show its value.
      if (lp.product_id) {
        const { data: prod } = await supabase.from('products').select('stock').eq('id', lp.product_id).single()
        if (prod) setStock(String(prod.stock))
      }
      setLoading(false)
    })
  }, [id, router])

  const publicUrl = store
    ? process.env.NODE_ENV === 'production'
      ? `https://${store.slug}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'krenix.store'}/p/${page?.slug}`
      : `/store/p/${page?.slug}?store=${store.slug}`
    : ''

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const persist = useCallback(async (opts?: { publish?: boolean }) => {
    if (!content || !page || !store) return
    const publish = opts?.publish ?? false
    setSaving(true)
    setError('')
    const supabase = createClient()
    // Stock: empty string → untracked (null). Otherwise clamp to integer >= 0.
    const stockValue = stock.trim() === '' ? null : Math.max(0, Math.floor(Number(stock)))
    if (stockValue !== null && !Number.isFinite(stockValue)) {
      setError('Stock invalide : entrez un nombre entier (ou laissez vide pour ne pas suivre le stock).')
      setSaving(false)
      return
    }
    const nextActive = publish ? true : isActive

    // On first publish, materialise a linked product so the page shows up in
    // "Produits" and a single Product row owns the stock going forward.
    let productId = page.product_id
    if (nextActive && !productId) {
      productId = await ensureLandingPageProduct(
        supabase,
        { ...page, title, content, stock: stockValue },
        store.id,
      )
      if (!productId) {
        setError('Erreur lors de la création du produit lié. Réessayez.')
        setSaving(false)
        return
      }
    }

    // When linked, keep the product in sync with this editor: the product owns the
    // stock, and its store visibility mirrors the page's publish state — so
    // unpublishing the page also pulls the product from the storefront.
    if (productId) {
      await supabase.from('products').update({
        is_active: nextActive,
        ...(stockValue !== null ? { stock: stockValue } : {}),
      }).eq('id', productId).eq('store_id', store.id)
    }

    const { error: err } = await supabase
      .from('landing_pages')
      .update({
        title, content, is_active: nextActive, updated_at: new Date().toISOString(),
        stock: stockValue,
        product_id: productId,
        upsell_enabled: upsellEnabled,
        upsell_product_name: upsellProductName || null,
        upsell_text: upsellText || null,
        upsell_price: upsellPrice ? Number(upsellPrice) : null,
        content_b: contentB,
        generated_images: photos,
      })
      .eq('id', page.id)
    if (err) {
      setError('Erreur lors de la sauvegarde: ' + err.message)
    } else {
      requestCacheRevalidate('landing-page')
      setIsActive(nextActive)
      setPage(p => (p ? { ...p, is_active: nextActive, product_id: productId } : p))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
    setSaving(false)
  }, [content, page, store, title, isActive, stock, upsellEnabled, upsellProductName, upsellText, upsellPrice, contentB, photos])

  const save = useCallback(() => persist(), [persist])

  // A/B testing helpers
  const createVariantB = () => {
    if (content) setContentB(JSON.parse(JSON.stringify(content)) as LandingPageContent)
  }
  const removeVariantB = () => setContentB(null)
  const setHeroB = (patch: Partial<LandingPageContent['hero']>) =>
    setContentB(c => (c ? { ...c, hero: { ...c.hero, ...patch } } : c))

  const photoCap = store ? getPhotoCount(store.plan) : 5

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length || !store || !page) return
    const remaining = photoCap - photos.length
    if (remaining <= 0) return
    setUploadingPhoto(true)
    const supabase = createClient()
    const newUrls: string[] = []
    for (const file of files.slice(0, remaining)) {
      const path = `${store.id}/landing-photos/${page.slug}/manual-${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split('.').pop()}`
      const { data, error: upErr } = await supabase.storage.from('product-images').upload(path, file)
      if (!upErr && data) {
        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(data.path)
        newUrls.push(urlData.publicUrl)
      }
    }
    setPhotos(prev => [...prev, ...newUrls])
    setUploadingPhoto(false)
  }

  const removePhoto = (idx: number) => setPhotos(prev => prev.filter((_, i) => i !== idx))

  const deletePage = async () => {
    if (!page) return
    if (!confirm('Supprimer cette landing page ? Cette action est irréversible.')) return
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('landing_pages').delete().eq('id', page.id)
    router.push('/dashboard/pages')
  }

  // Helpers to update nested content
  const toggleSection = (key: LandingPageSectionKey) =>
    setContent(c => {
      if (!c) return c
      const hidden = new Set(c.hidden_sections ?? [])
      if (hidden.has(key)) hidden.delete(key)
      else hidden.add(key)
      return { ...c, hidden_sections: Array.from(hidden) }
    })

  const setHero = (patch: Partial<LandingPageContent['hero']>) =>
    setContent(c => c ? { ...c, hero: { ...c.hero, ...patch } } : c)

  const setBenefit = (i: number, patch: Partial<LandingPageContent['benefits'][0]>) =>
    setContent(c => {
      if (!c) return c
      const benefits = [...c.benefits]
      benefits[i] = { ...benefits[i], ...patch }
      return { ...c, benefits }
    })

  const setTestimonial = (i: number, patch: Partial<LandingPageContent['social_proof']['testimonials'][0]>) =>
    setContent(c => {
      if (!c) return c
      const testimonials = [...c.social_proof.testimonials]
      testimonials[i] = { ...testimonials[i], ...patch }
      return { ...c, social_proof: { ...c.social_proof, testimonials } }
    })

  const setSection = (i: number, patch: Partial<LandingPageContent['product_details']['sections'][0]>) =>
    setContent(c => {
      if (!c) return c
      const sections = [...c.product_details.sections]
      sections[i] = { ...sections[i], ...patch }
      return { ...c, product_details: { sections } }
    })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-dash-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!content || !page) return null

  return (
    <div className="max-w-2xl space-y-5 pb-10">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => router.push('/dashboard/pages')}
          className="p-2 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint/40 transition-all flex-shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="dash-font-heading font-medium text-[22px] text-dash-ink truncate">{title || 'Landing page'}</h1>
          <p className="text-dash-ink-soft text-xs font-mono mt-0.5 truncate">{page.slug}</p>
        </div>
        {/* Active toggle */}
        <button
          onClick={() => setIsActive(!isActive)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
            isActive
              ? 'border-dash-success/30 bg-dash-success-soft text-dash-success hover:bg-dash-success/15'
              : 'border-dash-border text-dash-ink-soft hover:border-dash-ink-faint/40 hover:text-dash-ink'
          }`}
        >
          {isActive ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
          {isActive ? 'Active' : 'Inactive'}
        </button>
        {/* Save */}
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-dash-accent hover:bg-dash-accent-dark text-white font-semibold text-sm transition-all disabled:opacity-60"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
          {saved ? 'Sauvegardé !' : 'Sauvegarder'}
        </button>
      </div>

      {error && (
        <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {/* Draft banner */}
      {!isActive && (
        <div className="bg-dash-gold-soft border border-dash-gold/20 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-dash-gold-dark font-medium text-sm">Cette page est un brouillon</p>
            <p className="text-dash-ink-soft text-xs mt-0.5">Publiez-la pour qu&apos;elle apparaisse sur votre boutique</p>
          </div>
          <button
            onClick={() => persist({ publish: true })}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-60 bg-dash-accent hover:bg-dash-accent-dark"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
            Publier
          </button>
        </div>
      )}

      {/* Public URL bar */}
      <div className="bg-dash-surface border border-dash-border rounded-xl px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-dash-ink-soft mb-0.5">Lien public</p>
          <p className="text-dash-ink text-sm font-mono truncate">{publicUrl}</p>
        </div>
        <button
          onClick={copyLink}
          className="p-2 rounded-lg border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint/40 transition-all flex-shrink-0"
          title="Copier le lien"
        >
          {copied ? <Check size={15} className="text-dash-success" /> : <Copy size={15} />}
        </button>
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-lg border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint/40 transition-all flex-shrink-0"
          title="Voir la page"
        >
          <ExternalLink size={15} />
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Vues', value: page.views },
          { label: 'Commandes', value: page.orders_count },
          { label: 'Taux conv.', value: page.views > 0 ? `${((page.orders_count / page.views) * 100).toFixed(1)}%` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-dash-surface border border-dash-border rounded-xl p-4 text-center">
            <p className="text-dash-ink font-bold text-lg">{value}</p>
            <p className="text-dash-ink-soft text-xs mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Stock / Inventaire */}
      <Section title="Stock — Inventaire">
        {page.product_id && (
          <p className="text-xs text-dash-accent bg-dash-accent-soft border border-dash-accent/20 rounded-lg px-3 py-2">
            Cette page est liée à une fiche produit. Le stock est partagé — le modifier ici met aussi à jour le produit dans « Produits ».
          </p>
        )}
        <Field label="Quantité en stock">
          <input
            type="number"
            min={0}
            step={1}
            value={stock}
            onChange={e => setStock(e.target.value)}
            placeholder="Laisser vide = stock non suivi"
            className="w-full px-3 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm"
          />
        </Field>
        {stock.trim() === '' ? (
          <p className="text-xs text-dash-ink-soft">
            Stock non suivi — la page reste toujours commandable. Entrez un nombre pour activer le suivi automatique du stock.
          </p>
        ) : Number(stock) <= 0 ? (
          <p className="text-xs text-dash-danger">
            ⚠ Rupture de stock — la page affiche « Rupture de stock » et bloque les commandes. Augmentez la quantité pour réactiver les commandes.
          </p>
        ) : Number(stock) <= 5 ? (
          <p className="text-xs text-dash-gold-dark">
            {`🔥 Stock faible — un badge « Plus que ${Math.floor(Number(stock))} en stock » s'affiche sur la page.`}
          </p>
        ) : (
          <p className="text-xs text-dash-ink-soft">
            Le stock diminue automatiquement à chaque commande confirmée et remonte si une commande est annulée ou retournée.
          </p>
        )}
      </Section>

      {/* --- CONTENT EDITOR --- */}

      {/* Photos */}
      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
        <div>
          <h3 className="text-dash-ink font-semibold text-sm">Photos de la page</h3>
          <p className="text-dash-ink-soft text-xs mt-0.5">
            {photos.length}/{photoCap} photos — ajoutez vos propres photos ou supprimez celles générées par l&apos;IA.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {photos.map((url, idx) => (
            <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden group">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removePhoto(idx)}
                className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={16} className="text-white" />
              </button>
            </div>
          ))}
          {photos.length < photoCap && (
            <label className="w-20 h-20 rounded-xl border-2 border-dashed border-dash-border hover:border-dash-accent/40 flex flex-col items-center justify-center cursor-pointer transition-all group">
              {uploadingPhoto ? (
                <Loader2 size={18} className="animate-spin text-dash-ink-soft" />
              ) : (
                <>
                  <Plus size={18} className="text-dash-ink-soft group-hover:text-dash-accent transition-colors" />
                  <span className="text-[10px] text-dash-ink-faint mt-1">Ajouter</span>
                </>
              )}
              <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
            </label>
          )}
        </div>
      </div>

      {/* Section visibility bar */}
      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-3">
        <div>
          <p className="text-dash-ink font-semibold text-sm">Sections visibles</p>
          <p className="text-dash-ink-soft text-xs mt-0.5">
            Désactivez les sections que vous ne voulez pas afficher — le Hero et le formulaire de commande restent toujours visibles.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {SECTION_TOGGLES.map(({ key, label }) => {
            const visible = isSectionVisible(content, key)
            return (
              <button
                key={key}
                onClick={() => toggleSection(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                  visible
                    ? 'border-dash-accent/40 bg-dash-accent-soft text-dash-accent'
                    : 'border-dash-border text-dash-ink-faint'
                }`}
              >
                {visible ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Titre de la page */}
      <Section title="Titre de la page">
        <Field label="Titre affiché dans la liste">
          <TextInput value={title} onChange={setTitle} placeholder="Titre de la page" />
        </Field>
      </Section>

      {/* Hero */}
      <Section title="Hero — Section principale">
        <Field label="Titre principal">
          <TextInput value={content.hero.headline} onChange={v => setHero({ headline: v })} placeholder="Titre accrocheur" />
        </Field>
        <Field label="Sous-titre">
          <TextArea value={content.hero.subheadline} onChange={v => setHero({ subheadline: v })} placeholder="Bénéfice principal" rows={2} />
        </Field>
        <Field label="Texte du bouton CTA">
          <TextInput value={content.hero.cta_text} onChange={v => setHero({ cta_text: v })} placeholder="Commander maintenant" />
        </Field>
      </Section>

      {/* Benefits */}
      <Section title="Avantages produit" hidden={!isSectionVisible(content, 'benefits')}>
        {content.benefits.map((b, i) => (
          <div key={i} className="bg-dash-surface-2 rounded-xl p-4 space-y-3">
            <p className="text-dash-ink-soft text-xs uppercase tracking-wider">Avantage {i + 1}</p>
            <Field label="Titre">
              <TextInput value={b.title} onChange={v => setBenefit(i, { title: v })} placeholder="Titre court" />
            </Field>
            <Field label="Description">
              <TextArea value={b.description} onChange={v => setBenefit(i, { description: v })} rows={2} placeholder="Description convaincante" />
            </Field>
          </div>
        ))}
      </Section>

      {/* Social proof */}
      <Section title="Preuves sociales" defaultOpen={false} hidden={!isSectionVisible(content, 'social_proof')}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre d'avis">
            <TextInput
              value={content.social_proof.review_count}
              onChange={v => setContent(c => c ? { ...c, social_proof: { ...c.social_proof, review_count: v } } : c)}
              placeholder="+2 300 clients"
            />
          </Field>
          <Field label="Note moyenne">
            <TextInput
              value={content.social_proof.rating}
              onChange={v => setContent(c => c ? { ...c, social_proof: { ...c.social_proof, rating: v } } : c)}
              placeholder="4.8"
            />
          </Field>
        </div>
        {content.social_proof.testimonials.map((t, i) => (
          <div key={i} className="bg-dash-surface-2 rounded-xl p-4 space-y-3">
            <p className="text-dash-ink-soft text-xs uppercase tracking-wider">Témoignage {i + 1}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nom">
                <TextInput value={t.name} onChange={v => setTestimonial(i, { name: v })} placeholder="Prénom Nom" />
              </Field>
              <Field label="Wilaya">
                <TextInput value={t.location} onChange={v => setTestimonial(i, { location: v })} placeholder="Alger" />
              </Field>
            </div>
            <Field label="Avis">
              <TextArea value={t.text} onChange={v => setTestimonial(i, { text: v })} rows={2} placeholder="Texte du témoignage" />
            </Field>
            <Field label="Note (1–5)">
              <input
                type="number"
                min={1}
                max={5}
                value={t.rating}
                onChange={e => setTestimonial(i, { rating: Number(e.target.value) })}
                className="w-20 px-3 py-2 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink outline-none focus:border-dash-accent/50 transition-all text-sm"
              />
            </Field>
          </div>
        ))}
      </Section>

      {/* Product details */}
      <Section title="Détails du produit" defaultOpen={false} hidden={!isSectionVisible(content, 'product_details')}>
        {content.product_details.sections.map((s, i) => (
          <div key={i} className="bg-dash-surface-2 rounded-xl p-4 space-y-3">
            <p className="text-dash-ink-soft text-xs uppercase tracking-wider">Section {i + 1}</p>
            <Field label="Titre">
              <TextInput value={s.title} onChange={v => setSection(i, { title: v })} placeholder="Titre de section" />
            </Field>
            <Field label="Contenu">
              <TextArea value={s.content} onChange={v => setSection(i, { content: v })} rows={3} placeholder="Contenu détaillé" />
            </Field>
          </div>
        ))}
      </Section>

      {/* Urgency */}
      <Section title="Urgence" defaultOpen={false} hidden={!isSectionVisible(content, 'urgency')}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type">
            <select
              value={content.urgency.type}
              onChange={e => setContent(c => c ? { ...c, urgency: { ...c.urgency, type: e.target.value as 'stock' | 'timer' | 'offer' } } : c)}
              className="w-full px-3 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink outline-none focus:border-dash-accent/50 transition-all text-sm"
            >
              <option value="stock">Stock limité</option>
              <option value="timer">Compte à rebours</option>
              <option value="offer">Offre spéciale</option>
            </select>
          </Field>
          <Field label="Valeur (ex: nb en stock)">
            <TextInput
              value={String(content.urgency.value ?? '')}
              onChange={v => setContent(c => c ? { ...c, urgency: { ...c.urgency, value: v } } : c)}
              placeholder="23"
            />
          </Field>
        </div>
        <Field label="Texte d'urgence">
          <TextInput
            value={content.urgency.text}
            onChange={v => setContent(c => c ? { ...c, urgency: { ...c.urgency, text: v } } : c)}
            placeholder="Plus que 23 pièces en stock !"
          />
        </Field>
      </Section>

      {/* Upsell */}
      <Section title="Upsell — Produit additionnel" defaultOpen={false}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-dash-ink text-sm font-semibold">Activer l&apos;upsell</p>
            <p className="text-dash-ink-soft text-xs mt-0.5">Proposer un produit en plus lors de la commande</p>
          </div>
          <button
            onClick={() => setUpsellEnabled(e => !e)}
            className={`w-11 h-6 rounded-full transition-all relative ${upsellEnabled ? 'bg-dash-accent' : 'bg-black/15'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${upsellEnabled ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>
        {upsellEnabled && (
          <div className="space-y-3 pt-2">
            <Field label="Nom du produit additionnel">
              <TextInput value={upsellProductName} onChange={setUpsellProductName} placeholder="Ceinture assortie" />
            </Field>
            <Field label="Prix de l'upsell (DA)">
              <input
                type="number"
                value={upsellPrice}
                onChange={e => setUpsellPrice(e.target.value)}
                placeholder="500"
                className="w-full px-3 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm"
              />
            </Field>
            <Field label="Texte affiché (optionnel)">
              <TextInput value={upsellText} onChange={setUpsellText} placeholder="Ajouter la ceinture pour seulement 500 DA de plus !" />
            </Field>
          </div>
        )}
      </Section>

      {/* A/B Testing (Business+) */}
      {store && (() => {
        const canAB = BUSINESS_PLANS.includes(store.plan as Plan)
        const viewsA = page.views ?? 0
        const convA = viewsA > 0 ? (variantOrders.A / viewsA) * 100 : 0
        const convB = viewsB > 0 ? (variantOrders.B / viewsB) * 100 : 0
        const enoughData = viewsA >= 20 && viewsB >= 20
        const winner = !enoughData ? null : convB > convA ? 'B' : convA > convB ? 'A' : null
        return (
          <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FlaskConical size={16} className="text-dash-purple" />
                <h3 className="text-dash-ink font-semibold text-sm">Test A/B</h3>
              </div>
              {!canAB && (
                <a href="/dashboard/billing/upgrade" className="text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 bg-dash-gold-soft text-dash-gold-dark">
                  <Lock size={11} /> Business
                </a>
              )}
            </div>

            {!canAB ? (
              <p className="text-dash-ink-soft text-xs">Testez deux versions de votre page et gardez la plus performante. Disponible à partir du plan Business.</p>
            ) : !contentB ? (
              <>
                <p className="text-dash-ink-soft text-xs">Créez une variante B : les visiteurs verront A ou B à 50/50, et vous verrez laquelle convertit le mieux.</p>
                <button onClick={createVariantB}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 bg-dash-purple">
                  <FlaskConical size={14} /> Créer une variante B
                </button>
              </>
            ) : (
              <>
                {/* Comparison */}
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { key: 'A', views: viewsA, orders: variantOrders.A, conv: convA },
                    { key: 'B', views: viewsB, orders: variantOrders.B, conv: convB },
                  ] as const).map(v => (
                    <div key={v.key} className={`rounded-xl p-3 border ${winner === v.key ? 'border-dash-success/40 bg-dash-success-soft' : 'border-dash-border bg-dash-surface-2'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-dash-ink font-bold text-sm">Variante {v.key}</span>
                        {winner === v.key && <span className="flex items-center gap-1 text-[10px] font-bold text-dash-success"><Trophy size={11} /> Gagnante</span>}
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-center">
                        <div><p className="text-dash-ink text-sm font-semibold">{v.views}</p><p className="text-dash-ink-faint text-[10px]">vues</p></div>
                        <div><p className="text-dash-ink text-sm font-semibold">{v.orders}</p><p className="text-dash-ink-faint text-[10px]">cmd.</p></div>
                        <div><p className="text-dash-purple text-sm font-semibold">{v.conv.toFixed(1)}%</p><p className="text-dash-ink-faint text-[10px]">conv.</p></div>
                      </div>
                    </div>
                  ))}
                </div>
                {!enoughData && <p className="text-[11px] text-dash-ink-faint">Au moins 20 vues par variante sont nécessaires pour désigner une gagnante.</p>}

                {/* Variant B hero editor (the key conversion levers) */}
                <div className="space-y-3 pt-1">
                  <p className="text-dash-ink-soft text-xs uppercase tracking-wider">Contenu de la variante B</p>
                  <Field label="Titre principal (B)">
                    <TextInput value={contentB.hero.headline} onChange={v => setHeroB({ headline: v })} placeholder="Titre alternatif" />
                  </Field>
                  <Field label="Sous-titre (B)">
                    <TextArea value={contentB.hero.subheadline} onChange={v => setHeroB({ subheadline: v })} rows={2} placeholder="Bénéfice alternatif" />
                  </Field>
                  <Field label="Bouton CTA (B)">
                    <TextInput value={contentB.hero.cta_text} onChange={v => setHeroB({ cta_text: v })} placeholder="Commander maintenant" />
                  </Field>
                  <p className="text-[11px] text-dash-ink-faint">Le reste de la page (avantages, témoignages…) est partagé entre A et B. N&apos;oubliez pas d&apos;enregistrer.</p>
                </div>

                <button onClick={removeVariantB}
                  className="flex items-center gap-1.5 text-xs text-dash-danger/70 hover:text-dash-danger transition-colors">
                  <Trash2 size={12} /> Supprimer la variante B
                </button>
              </>
            )}
          </div>
        )
      })()}

      {/* Order form */}
      <Section title="Formulaire de commande" defaultOpen={false}>
        <Field label="Titre du formulaire">
          <TextInput
            value={content.order_form.title}
            onChange={v => setContent(c => c ? { ...c, order_form: { title: v } } : c)}
            placeholder="Commandez maintenant"
          />
        </Field>
      </Section>

      {/* Save + Delete */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-dash-accent hover:bg-dash-accent-dark text-white font-semibold text-sm transition-all disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : <Save size={16} />}
          {saved ? 'Sauvegardé !' : 'Sauvegarder les modifications'}
        </button>
        <button
          onClick={deletePage}
          disabled={deleting}
          className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dash-danger/20 text-dash-danger/70 hover:text-dash-danger hover:border-dash-danger/40 hover:bg-dash-danger-soft transition-all text-sm"
        >
          {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
          Supprimer
        </button>
      </div>
    </div>
  )
}
