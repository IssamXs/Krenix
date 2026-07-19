'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { Store, LandingPage } from '@/types/database'
import { ULTIMATE_PLANS } from '@/types/database'
import { getPhotoCount, PHOTO_SCENES } from '@/lib/landing-photos'
import {
  Sparkles, ArrowLeft, Loader2, Lock, X, ImageIcon,
  RefreshCw, Pencil, Rocket, Check, Globe
} from 'lucide-react'
import ThemedLanding from '@/components/store/ThemedLanding'

const STYLES = [
  { id: 'minimaliste', label: 'Minimaliste', desc: 'Épuré et élégant' },
  { id: 'impact',      label: 'Impact',      desc: 'Dynamique, fort' },
  { id: 'premium',     label: 'Premium',     desc: 'Luxueux, raffiné' },
]

const LANGS = [
  { id: 'fr',   label: 'Français',  flag: '🇫🇷' },
  { id: 'ar',   label: 'عربي',      flag: '🇩🇿' },
  { id: 'both', label: 'Les deux',  flag: '🌐' },
]

type Step = 'form' | 'preview'

export default function NewLandingPage() {
  const router = useRouter()
  const [store, setStore] = useState<Store | null>(null)
  const [step, setStep] = useState<Step>('form')
  const [generatedPage, setGeneratedPage] = useState<LandingPage | null>(null)

  // Form fields
  const [selectedStyle, setSelectedStyle] = useState('impact')
  const [selectedLang, setSelectedLang] = useState('fr')
  const [productName, setProductName] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imagePreview, setImagePreview] = useState('')
  const [inputMode, setInputMode] = useState<'upload' | 'link'>('upload')
  const [productLink, setProductLink] = useState('')
  const [importing, setImporting] = useState(false)

  // UI state
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [error, setError] = useState('')
  const [photosTotal, setPhotosTotal] = useState(0)
  const [photosDone, setPhotosDone] = useState(0)
  const [failedScenes, setFailedScenes] = useState<number[]>([])
  const [retryingScene, setRetryingScene] = useState<number | null>(null)
  const [photoError, setPhotoError] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const storeData = await resolveActiveStore(supabase, user.id) as Store | null
      if (!storeData) { router.push('/onboarding/step-1'); return }
      // AI credits are a shared account pool (owner's primary store): plan
      // allowance + purchased top-ups. Use that for the guard/counter, not the
      // active boutique's own balance (0 for secondary agency stores).
      const { data: primary } = await supabase
        .from('stores').select('ai_credits, purchased_credits')
        .eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      const pooled = ((primary?.ai_credits as number | undefined) ?? storeData.ai_credits ?? 0)
        + ((primary?.purchased_credits as number | undefined) ?? 0)
      setStore({ ...storeData, ai_credits: pooled })
    })
  }, [router])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const supabase = createClient()
    const path = `landing-page-images/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const { data, error: uploadError } = await supabase.storage.from('product-images').upload(path, file, { upsert: true })
    if (!uploadError && data) {
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(data.path)
      setImageUrl(urlData.publicUrl)
      setImagePreview(urlData.publicUrl)
    } else {
      const msg = uploadError?.message ?? ''
      setError(msg.includes('Bucket') || msg.includes('bucket')
        ? 'Bucket storage introuvable. Exécutez Database/005_storage.sql dans Supabase.'
        : `Erreur upload: ${msg || 'Réessayez.'}`)
    }
    setUploading(false)
  }

  const handleImportLink = async () => {
    if (!productLink.trim()) { setError('Collez un lien produit.'); return }
    setImporting(true)
    setError('')
    try {
      const res = await fetch('/api/ai/import-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: productLink.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Import impossible. Uploadez une photo manuellement.')
        return
      }
      setImageUrl(data.imageUrl)
      setImagePreview(data.imageUrl)
      if (data.title && !productName.trim()) setProductName(data.title)
      if (data.price && !price.trim()) setPrice(String(data.price))
    } catch {
      setError('Erreur réseau. Réessayez.')
    } finally {
      setImporting(false)
    }
  }

  // Generate (or regenerate) a single product photo for one scene.
  // Returns true on success. On failure, records the scene index so the UI can
  // offer a retry. Callers MUST NOT run this concurrently for the same page —
  // the photos route does a read-then-write on generated_images that is only
  // race-safe with one writer at a time.
  const generatePhoto = async (sceneIndex: number, targetPageId: string): Promise<boolean> => {
    try {
      const photoRes = await fetch('/api/ai/landing-page/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landingPageId: targetPageId, sceneIndex }),
      })
      if (photoRes.ok) {
        const { imageUrl: photoUrl } = await photoRes.json()
        setGeneratedPage(prev => {
          if (!prev || prev.id !== targetPageId) return prev
          const next = [...(prev.generated_images ?? [])]
          next[sceneIndex] = photoUrl
          return { ...prev, generated_images: next }
        })
        setFailedScenes(prev => prev.filter(i => i !== sceneIndex))
        setPhotoError('')
        return true
      }
      // Non-OK — capture the server's reason so the UI can explain the failure
      const data = await photoRes.json().catch(() => ({}))
      setPhotoError(data.error || 'Échec de la génération de la photo.')
    } catch {
      setPhotoError('Erreur réseau lors de la génération des photos.')
    }
    setFailedScenes(prev => (prev.includes(sceneIndex) ? prev : [...prev, sceneIndex]))
    return false
  }

  const handleRetryPhoto = async (sceneIndex: number) => {
    if (!generatedPage || retryingScene !== null) return
    setRetryingScene(sceneIndex)
    await generatePhoto(sceneIndex, generatedPage.id)
    setRetryingScene(null)
  }

  const handleGenerate = async () => {
    if (!productName.trim()) { setError('Le nom du produit est requis.'); return }
    if (!price || isNaN(Number(price)) || Number(price) <= 0) { setError('Entrez un prix valide.'); return }
    if (stock === '' || isNaN(Number(stock)) || !Number.isInteger(Number(stock)) || Number(stock) < 1) {
      setError('Entrez un stock valide (nombre entier ≥ 1).'); return
    }
    if ((store?.ai_credits ?? 0) < 5) { setError('Vous n\'avez plus assez de crédits IA (5 requis).'); return }

    setGenerating(true)
    setError('')

    const res = await fetch('/api/ai/landing-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productName: productName.trim(),
        price: Number(price),
        stock: Number(stock),
        description: description.trim() || null,
        imageUrl: imageUrl || null,
        style: selectedStyle,
        language: selectedLang,
      }),
    })

    if (res.status === 402) {
      setError('Crédits insuffisants. Rechargez votre plan.')
      setGenerating(false)
      return
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Erreur lors de la génération. Réessayez.')
      setGenerating(false)
      return
    }

    const { landingPage } = await res.json()
    setGeneratedPage(landingPage as LandingPage)
    // Deduct credits locally so the sidebar counter reflects it
    if (store) setStore({ ...store, ai_credits: store.ai_credits - 5 })
    setStep('preview')
    setGenerating(false)

    // Phase 2 — generate photos sequentially (only if a source image was provided)
    if (imageUrl && store) {
      const targetPageId = (landingPage as LandingPage).id
      const planPhotoCount = getPhotoCount(store.plan)
      setPhotosTotal(planPhotoCount)
      setPhotosDone(0)
      setFailedScenes([])
      setPhotoError('')
      for (let sceneIndex = 0; sceneIndex < planPhotoCount; sceneIndex++) {
        // Awaited sequentially — never concurrent (see generatePhoto contract)
        await generatePhoto(sceneIndex, targetPageId)
        setPhotosDone(sceneIndex + 1)
      }
    }
  }

  const handlePublish = async () => {
    if (!generatedPage) return
    setPublishing(true)
    const supabase = createClient()
    await supabase.from('landing_pages').update({ is_active: true }).eq('id', generatedPage.id)
    setPublished(true)
    setTimeout(() => router.push('/dashboard/pages'), 1600)
  }

  const handleRegenerate = () => {
    setStep('form')
    setGeneratedPage(null)
    setPublished(false)
    setError('')
    setPhotosTotal(0)
    setPhotosDone(0)
    setFailedScenes([])
    setRetryingScene(null)
    setPhotoError('')
  }

  const noCredits = !!store && store.ai_credits < 5

  // ---- PREVIEW STEP ----
  if (step === 'preview' && generatedPage && store) {
    const meta = generatedPage.content._meta
    const isBilingual = meta?.lang === 'both'

    return (
      <div className="fixed inset-0 bg-dash-page z-40 flex flex-col overflow-hidden">

        {/* Action bar */}
        <div className="flex-shrink-0 h-14 flex items-center gap-2 px-4 bg-dash-surface border-b border-dash-border">
          <button
            onClick={handleRegenerate}
            className="p-2 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint/40 transition-all"
            title="Retour au formulaire"
          >
            <ArrowLeft size={16} />
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-dash-ink font-semibold text-sm truncate">{generatedPage.title}</p>
            {isBilingual && (
              <p className="text-[10px] text-dash-accent">
                <Globe size={9} className="inline mr-1" />
                Bilingue FR + عربي
              </p>
            )}
            {photosTotal > 0 && photosDone < photosTotal && (
              <p className="text-[10px] text-dash-ink-soft flex items-center gap-1">
                <Loader2 size={9} className="animate-spin" />
                Création des photos produit… ({photosDone}/{photosTotal})
              </p>
            )}
          </div>

          <button
            onClick={handleRegenerate}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink text-xs transition-all"
          >
            <RefreshCw size={13} />
            Régénérer
          </button>

          <button
            onClick={() => router.push(`/dashboard/pages/${generatedPage.id}`)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink text-xs transition-all"
          >
            <Pencil size={13} />
            Modifier
          </button>

          <button
            onClick={handlePublish}
            disabled={publishing || published}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-70 ${published ? 'bg-dash-success' : 'bg-dash-accent hover:bg-dash-accent-dark'}`}
          >
            {publishing ? (
              <><Loader2 size={15} className="animate-spin" /> Publication…</>
            ) : published ? (
              <><Check size={15} /> Publié !</>
            ) : (
              <><Rocket size={15} /> Publier sur ma boutique</>
            )}
          </button>
        </div>

        {/* Failed-photo retry banner */}
        {failedScenes.length > 0 && (
          <div className="flex-shrink-0 bg-dash-gold-soft border-b border-dash-gold/20 px-4 py-2 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-dash-gold-dark font-medium flex items-center gap-1">
              <ImageIcon size={12} />
              {failedScenes.length} photo{failedScenes.length > 1 ? 's' : ''} non générée{failedScenes.length > 1 ? 's' : ''} — réessayer (gratuit) :
            </span>
            {[...failedScenes].sort((a, b) => a - b).map(idx => {
              const loopRunning = photosTotal > 0 && photosDone < photosTotal
              return (
                <button
                  key={idx}
                  onClick={() => handleRetryPhoto(idx)}
                  disabled={retryingScene !== null || loopRunning}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-dash-gold/15 border border-dash-gold/30 text-dash-gold-dark text-[11px] font-medium hover:bg-dash-gold/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {retryingScene === idx
                    ? <Loader2 size={11} className="animate-spin" />
                    : <RefreshCw size={11} />}
                  {PHOTO_SCENES[idx]?.label ?? `Photo ${idx + 1}`}
                </button>
              )
            })}
            {photoError && (
              <span className="w-full text-[11px] text-dash-gold-dark/80 mt-0.5">
                {photoError}
              </span>
            )}
          </div>
        )}

        {/* Preview — phone frame */}
        <div className="flex-1 overflow-auto flex items-start justify-center py-6 px-4">
          <div className="w-full" style={{ maxWidth: 420 }}>
            {/* Phone frame chrome */}
            <div
              className="rounded-[36px] overflow-hidden"
              style={{
                border: '8px solid #1C1C2E',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 40px 80px rgba(0,0,0,0.8)',
              }}
            >
              {/* Status bar */}
              <div className="h-7 flex items-center justify-between px-5 text-[10px] text-gray-500 bg-[#111118]">
                <span>9:41</span>
                <div className="flex gap-1 items-center">
                  <span>●●●</span>
                  <span>WiFi</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Page content */}
              <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 14rem)' }}>
                <ThemedLanding landingPage={generatedPage} store={store} />
              </div>
            </div>

            {/* Mobile action buttons below phone */}
            <div className="flex gap-2 mt-4 sm:hidden">
              <button onClick={handleRegenerate} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dash-border text-dash-ink-soft text-xs">
                <RefreshCw size={13} /> Régénérer
              </button>
              <button onClick={() => router.push(`/dashboard/pages/${generatedPage.id}`)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dash-border text-dash-ink-soft text-xs">
                <Pencil size={13} /> Modifier
              </button>
            </div>

            <p className="text-center text-dash-ink-soft text-xs mt-3">
              Aperçu de ce que vos clients verront
            </p>

            {/* Upgrade nudge — only for plans below Ultimate */}
            {!ULTIMATE_PLANS.includes(store.plan) && (
              <div className="mt-4 rounded-[20px] p-4 border bg-dash-gold-soft border-dash-gold/25">
                <div className="flex items-start gap-3">
                  <Sparkles size={16} className="text-dash-gold-dark flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-[13px] leading-relaxed text-dash-ink">
                      {store.plan === 'basic'
                        ? 'Vous venez de goûter à la qualité Ultimate (5 photos premium). Passez à Ultimate pour générer une nouvelle page chaque semaine, le chatbot IA et tous les thèmes.'
                        : 'Passez à Ultimate pour 5 photos premium par page, le chatbot IA et des limites supérieures.'}
                    </p>
                    <button
                      onClick={() => router.push('/dashboard/billing')}
                      className="mt-2 text-xs font-bold text-dash-gold-dark hover:opacity-80 transition-opacity"
                    >
                      Passer à Ultimate →
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ---- FORM STEP ----
  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/dashboard/pages')}
          className="p-2 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint/40 transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Nouvelle landing page</h1>
          <p className="text-dash-ink-soft text-sm">L&apos;IA génère tout — photo, texte, témoignages</p>
        </div>
      </div>

      {noCredits && (
        <div className="bg-dash-danger-soft border border-dash-danger/20 rounded-xl p-4 flex items-center gap-3">
          <Lock size={18} className="text-dash-danger flex-shrink-0" />
          <div>
            <p className="text-dash-danger font-medium text-sm">Plus de crédits IA</p>
            <p className="text-dash-ink-soft text-xs mt-0.5">
              {ULTIMATE_PLANS.includes(store!.plan)
                ? 'Rechargez vos crédits pour continuer à générer'
                : 'Passez au plan Pro ou Ultimate pour continuer'}
            </p>
          </div>
          {ULTIMATE_PLANS.includes(store!.plan) ? (
            <button onClick={() => router.push('/dashboard/billing/credits')} className="ml-auto text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap transition-all hover:opacity-90 bg-dash-accent text-white">
              + Recharger mes crédits
            </button>
          ) : (
            <button onClick={() => router.push('/dashboard/billing')} className="ml-auto text-xs text-dash-accent hover:opacity-80 transition-opacity whitespace-nowrap font-medium">
              Upgrader →
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-5">

        {/* Photo */}
        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">
            Photo du produit <span className="text-dash-ink-faint normal-case">(optionnel — améliore la qualité)</span>
          </label>

          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setInputMode('upload')}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                inputMode === 'upload' ? 'border-dash-accent/50 bg-dash-accent-soft text-dash-accent' : 'border-dash-border text-dash-ink-soft'
              }`}
            >
              Uploader une photo
            </button>
            <button
              onClick={() => setInputMode('link')}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                inputMode === 'link' ? 'border-dash-accent/50 bg-dash-accent-soft text-dash-accent' : 'border-dash-border text-dash-ink-soft'
              }`}
            >
              Importer un lien
            </button>
          </div>

          {inputMode === 'link' && !imagePreview && (
            <div className="flex gap-2 mb-3">
              <input
                value={productLink}
                onChange={e => setProductLink(e.target.value)}
                placeholder="https://fournisseur.com/produit"
                className="flex-1 px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm"
              />
              <button
                onClick={handleImportLink}
                disabled={importing || !productLink.trim()}
                className="px-4 rounded-xl bg-dash-accent/15 border border-dash-accent/30 text-dash-accent text-sm font-semibold disabled:opacity-50"
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : 'Importer'}
              </button>
            </div>
          )}

          {imagePreview ? (
            <div className="relative">
              <img src={imagePreview} alt="Aperçu" className="w-full h-44 object-cover rounded-xl" />
              <button
                onClick={() => { setImageUrl(''); setImagePreview(''); setProductLink('') }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ) : inputMode === 'upload' ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-32 rounded-xl border border-dashed border-dash-border flex flex-col items-center justify-center gap-2 hover:border-dash-accent/40 hover:bg-dash-accent-soft transition-all"
            >
              {uploading ? <Loader2 size={22} className="animate-spin text-dash-ink-soft" /> : (
                <>
                  <ImageIcon size={22} className="text-dash-ink-faint" />
                  <span className="text-dash-ink-soft text-xs">Cliquez pour uploader une photo</span>
                  <span className="text-dash-ink-faint text-[10px]">PNG, JPG — max 5 MB</span>
                </>
              )}
            </button>
          ) : null}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </div>

        {/* Product name */}
        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">
            Nom du produit <span className="text-dash-danger">*</span>
          </label>
          <input
            value={productName}
            onChange={e => setProductName(e.target.value)}
            placeholder="Ex: Montre connectée SportMax"
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all"
          />
        </div>

        {/* Price + Stock */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">
              Prix (DZD) <span className="text-dash-danger">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="2990"
                min="1"
                className="w-full px-4 py-3 pr-16 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-dash-ink-soft text-sm font-medium">DZD</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">
              Stock <span className="text-dash-danger">*</span>
            </label>
            <input
              type="number"
              value={stock}
              onChange={e => setStock(e.target.value)}
              placeholder="50"
              min="1"
              step="1"
              className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">
            Description <span className="text-dash-ink-faint normal-case">(optionnel)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            placeholder="Décrivez brièvement votre produit… L'IA complète le reste."
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all resize-none"
          />
        </div>

        {/* Style */}
        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Style de page</label>
          <div className="grid grid-cols-3 gap-2">
            {STYLES.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedStyle(s.id)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  selectedStyle === s.id ? 'border-dash-accent/50 bg-dash-accent-soft' : 'border-dash-border hover:border-dash-ink-faint/40'
                }`}
              >
                <p className={`text-sm font-medium ${selectedStyle === s.id ? 'text-dash-accent' : 'text-dash-ink'}`}>{s.label}</p>
                <p className="text-dash-ink-soft text-xs mt-0.5">{s.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Langue de la page</label>
          <div className="grid grid-cols-3 gap-2">
            {LANGS.map(l => (
              <button
                key={l.id}
                onClick={() => setSelectedLang(l.id)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedLang === l.id ? 'border-dash-accent/50 bg-dash-accent-soft' : 'border-dash-border hover:border-dash-ink-faint/40'
                }`}
              >
                <p className="text-lg mb-0.5">{l.flag}</p>
                <p className={`text-sm font-medium ${selectedLang === l.id ? 'text-dash-accent' : 'text-dash-ink'}`}>{l.label}</p>
              </button>
            ))}
          </div>
          {selectedLang === 'both' && (
            <p className="text-xs text-dash-accent/80 mt-2 flex items-center gap-1">
              <Globe size={11} />
              La page aura un sélecteur de langue — vos clients choisissent FR ou عربي
            </p>
          )}
        </div>

        {/* Credits info */}
        <div className="bg-dash-surface-2 rounded-xl p-3 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-dash-ink-soft">
            <Sparkles size={14} className="text-dash-accent" />
            Coût : 5 crédits IA
          </div>
          <span className="text-dash-ink font-semibold">{store?.ai_credits ?? 0} restants</span>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating || noCredits || !productName.trim() || !price}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm bg-dash-accent hover:bg-dash-accent-dark text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? (
            <><Loader2 size={18} className="animate-spin" /> Génération en cours…</>
          ) : (
            <><Sparkles size={16} /> Générer la landing page</>
          )}
        </button>
      </div>
    </div>
  )
}
