'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore, invalidateActiveStoreCache } from '@/lib/active-store'
import { ULTIMATE_PLANS, type Plan, type Store, type OrderMessagesSettings } from '@/types/database'
import { WILAYAS, DEFAULT_DELIVERY_RATES, DEFAULT_DELIVERY_RATES_STOPDESK } from '@/lib/wilayas'
import { DEFAULT_ORDER_MESSAGES } from '@/lib/whatsapp'
import { HOMEPAGE_SECTIONS, getHomepageEditor } from '@/lib/homepage-editor'
import {
  Loader2, Save, AlertCircle, Truck, ChevronDown, ChevronUp, Building2, MessageCircle, Type, Bell,
  Settings2, Palette, FileText, Share2, Crown, Lock, Sparkles,
} from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import TelegramAlertsCard from '@/components/dashboard/settings/TelegramAlertsCard'
import { requestCacheRevalidate } from '@/lib/cache/revalidate-client'
import { useI18n } from '@/lib/i18n/LocaleProvider'

// Shared field styling — the dashboard has no <Input> primitive, and this page
// alone has ~20 inputs; hoisting the class strings keeps them consistent.
const LABEL = 'block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider font-bold'
const INPUT = 'w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all'
const INPUT_TEXTAREA = INPUT + ' resize-none text-sm'

type Tab = 'general' | 'identity' | 'content' | 'social' | 'whatsapp' | 'notifications' | 'delivery' | 'pro'

export default function SettingsPage() {
  const { t } = useI18n()
  const ORDER_MSG_FIELDS: { key: keyof OrderMessagesSettings; label: string }[] = [
    { key: 'confirmed',    label: t('settings.msgConfirmed') },
    { key: 'chez_livreur', label: t('settings.msgChezLivreur') },
    { key: 'en_livraison', label: t('settings.msgEnLivraison') },
    { key: 'livree',       label: t('settings.msgLivree') },
    { key: 'annulee',      label: t('settings.msgAnnulee') },
  ]
  const router = useRouter()
  const [store, setStore] = useState<Store | null>(null)
  const [products, setProducts] = useState<{ id: string; name: string }[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const [form, setForm] = useState({
    name: '', whatsapp: '', facebook: '', instagram: '', tiktok: '', snapchat: '', youtube: '',
    welcomeMessage: '', bio: '', email: '', address: '',
    heroHeadline: '', heroSubtitle: '', heroCta: '', promoTitle: '', footerTagline: '',
    storeLanguage: 'fr' as 'fr' | 'ar',
  })
  const [homepage, setHomepage] = useState(getHomepageEditor(null))
  const [deliveryRates, setDeliveryRates] = useState<Record<string, number>>({ default: 600 })
  const [deliveryPricingMode, setDeliveryPricingMode] = useState<'flat' | 'wilaya'>('wilaya')
  const [deliveryRatesStopdesk, setDeliveryRatesStopdesk] = useState<Record<string, number>>({ default: 550 })
  const [showAllWilayasStopdesk, setShowAllWilayasStopdesk] = useState(false)
  const [stopdeskEnabled, setStopdeskEnabled] = useState(true)
  const [orderMessages, setOrderMessages] = useState<OrderMessagesSettings>({})
  const [showOrderMessages, setShowOrderMessages] = useState(false)
  const [showAllWilayas, setShowAllWilayas] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [bannerUploading, setBannerUploading] = useState(false)
  const [bannerUrl, setBannerUrl] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoUrl, setLogoUrl] = useState('')
  const [notifyStockAlerts, setNotifyStockAlerts] = useState(true)
  const [whatsappConfirmEnabled, setWhatsappConfirmEnabled] = useState(true)
  const [pendingLangChange, setPendingLangChange] = useState<null | 'fr' | 'ar'>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const data = await resolveActiveStore(supabase, user.id) as Store | null
      if (!data) { router.push('/onboarding/step-1'); return }
      setStore(data as Store)
      setForm({
        name: data.name,
        whatsapp: data.settings?.whatsapp ?? '',
        facebook: data.settings?.facebook ?? '',
        instagram: data.settings?.instagram ?? '',
        tiktok: data.settings?.tiktok ?? '',
        snapchat: data.settings?.snapchat ?? '',
        youtube: data.settings?.youtube ?? '',
        welcomeMessage: data.settings?.welcomeMessage ?? '',
        bio: data.settings?.bio ?? '',
        email: data.settings?.email ?? '',
        address: data.settings?.address ?? '',
        heroHeadline: data.settings?.storeContent?.heroHeadline ?? '',
        heroSubtitle: data.settings?.storeContent?.heroSubtitle ?? '',
        heroCta: data.settings?.storeContent?.heroCta ?? '',
        promoTitle: data.settings?.storeContent?.promoTitle ?? '',
        footerTagline: data.settings?.storeContent?.footerTagline ?? '',
        storeLanguage: (data.settings?.storeLanguage ?? 'fr') as 'fr' | 'ar',
      })
      setHomepage(getHomepageEditor(data.settings))
      supabase.from('products').select('id, name').eq('store_id', data.id).order('position', { ascending: true })
        .then(({ data: rows }) => setProducts((rows ?? []) as { id: string; name: string }[]))
      setBannerUrl(data.settings?.bannerUrl ?? '')
      setLogoUrl(data.logo_url ?? '')
      setNotifyStockAlerts(data.settings?.notifyStockAlerts ?? true)
      setWhatsappConfirmEnabled(data.settings?.whatsappConfirmEnabled ?? true)
      setStopdeskEnabled(data.settings?.stopdeskEnabled ?? true)
      setOrderMessages(data.settings?.orderMessages ?? {})
      const existing = data.settings?.deliveryRates
      setDeliveryRates(existing && Object.keys(existing).length > 1 ? existing : { ...DEFAULT_DELIVERY_RATES })
      setDeliveryPricingMode(data.settings?.deliveryPricingMode ?? 'wilaya')
      const existingStopdesk = data.settings?.deliveryRatesStopdesk
      setDeliveryRatesStopdesk(existingStopdesk && Object.keys(existingStopdesk).length > 1 ? existingStopdesk : { ...DEFAULT_DELIVERY_RATES_STOPDESK })
      setLoading(false)
    })
  }, [router])

  const isPro = !!store && ULTIMATE_PLANS.includes(store.plan as Plan)

  const handleSave = async () => {
    if (!store) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('stores').update({
      name: form.name,
      logo_url: logoUrl || store.logo_url,
      settings: {
        ...store.settings,
        whatsapp: form.whatsapp, facebook: form.facebook, instagram: form.instagram,
        tiktok: form.tiktok, snapchat: form.snapchat, youtube: form.youtube,
        welcomeMessage: form.welcomeMessage, bio: form.bio, email: form.email, address: form.address,
        bannerUrl: bannerUrl || store.settings?.bannerUrl,
        notifyStockAlerts,
        deliveryRates, deliveryPricingMode,
        deliveryPrice: deliveryRates.default ?? 600,
        deliveryRatesStopdesk,
        freeDeliveryThreshold: store.settings?.freeDeliveryThreshold ?? 0,
        orderMessages,
        homepage,
        storeLanguage: form.storeLanguage,
        storeContent: {
          heroHeadline: form.heroHeadline, heroSubtitle: form.heroSubtitle, heroCta: form.heroCta,
          promoTitle: form.promoTitle, footerTagline: form.footerTagline,
        },
      },
    }).eq('id', store.id)
    requestCacheRevalidate('store')
    invalidateActiveStoreCache()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const uploadImage = async (file: File, kind: 'logo' | 'banner') => {
    if (!store) return
    const setUploading = kind === 'logo' ? setLogoUploading : setBannerUploading
    const setUrl = kind === 'logo' ? setLogoUrl : setBannerUrl
    setUploading(true)
    const ext = file.name.split('.').pop()
    // A unique path per upload (not a fixed `${kind}.${ext}`) — Supabase Storage
    // objects are served with a long cache lifetime, so re-uploading over the
    // same path left the old image showing (browser/CDN kept serving the stale
    // bytes for that exact URL) even though the upload itself succeeded.
    const path = `${store.id}/${kind}-${Date.now()}.${ext}`
    const formData = new FormData()
    formData.append('file', file)
    formData.append('bucket', 'store-logos')
    formData.append('path', path)
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { alert(t('settings.uploadImageError', { error: data.error || t('settings.unknownError') })); setUploading(false); return }
      setUrl(data.url)
      const supabase = createClient()
      if (kind === 'logo') await supabase.from('stores').update({ logo_url: data.url }).eq('id', store.id)
      else await supabase.from('stores').update({ settings: { ...store.settings, bannerUrl: data.url } }).eq('id', store.id)
      requestCacheRevalidate('store')
      invalidateActiveStoreCache()
    } catch {
      alert(t('settings.uploadConnectionError'))
    }
    setUploading(false)
  }

  const removeImage = async (kind: 'logo' | 'banner') => {
    if (!store) return
    if (!confirm(kind === 'logo' ? t('settings.confirmRemoveLogo') : t('settings.confirmRemoveBanner'))) return
    const setUploading = kind === 'logo' ? setLogoUploading : setBannerUploading
    const setUrl = kind === 'logo' ? setLogoUrl : setBannerUrl
    setUploading(true)
    const supabase = createClient()
    if (kind === 'logo') {
      await supabase.from('stores').update({ logo_url: null }).eq('id', store.id)
      setStore(s => s ? { ...s, logo_url: null } : s)
    } else {
      const nextSettings = { ...store.settings }
      delete nextSettings.bannerUrl
      await supabase.from('stores').update({ settings: nextSettings }).eq('id', store.id)
      setStore(s => s ? { ...s, settings: nextSettings } : s)
    }
    requestCacheRevalidate('store')
    invalidateActiveStoreCache()
    setUrl('')
    setUploading(false)
  }

  const toggleStockAlerts = async () => {
    if (!store) return
    const next = !notifyStockAlerts
    setNotifyStockAlerts(next)
    const supabase = createClient()
    await supabase.from('stores').update({ settings: { ...store.settings, notifyStockAlerts: next } }).eq('id', store.id)
    setStore(s => s ? { ...s, settings: { ...s.settings, notifyStockAlerts: next } } : s)
  }

  const toggleWhatsappConfirmEnabled = async () => {
    if (!store) return
    const next = !whatsappConfirmEnabled
    setWhatsappConfirmEnabled(next)
    const supabase = createClient()
    await supabase.from('stores').update({ settings: { ...store.settings, whatsappConfirmEnabled: next } }).eq('id', store.id)
    setStore(s => s ? { ...s, settings: { ...s.settings, whatsappConfirmEnabled: next } } : s)
    requestCacheRevalidate('store')
  }

  const toggleStopdeskEnabled = async () => {
    if (!store) return
    const next = !stopdeskEnabled
    setStopdeskEnabled(next)
    const supabase = createClient()
    await supabase.from('stores').update({ settings: { ...store.settings, stopdeskEnabled: next } }).eq('id', store.id)
    setStore(s => s ? { ...s, settings: { ...s.settings, stopdeskEnabled: next } } : s)
  }

  const setWilayaRate = (wilaya: string, val: string) => {
    const num = Number(val)
    setDeliveryRates(r => ({ ...r, [wilaya]: isNaN(num) ? 0 : num }))
  }

  const applyDefaultToAll = () => {
    const def = deliveryRates.default ?? 600
    const all: Record<string, number> = { default: def }
    WILAYAS.forEach(w => { all[w] = def })
    setDeliveryRates(all)
  }

  const setWilayaStopdeskRate = (wilaya: string, val: string) => {
    const num = Number(val)
    setDeliveryRatesStopdesk(r => ({ ...r, [wilaya]: isNaN(num) ? 0 : num }))
  }

  const applyStopdeskDefaultToAll = () => {
    const def = deliveryRatesStopdesk.default ?? 550
    const all: Record<string, number> = { default: def }
    WILAYAS.forEach(w => { all[w] = def })
    setDeliveryRatesStopdesk(all)
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const PRIORITY_WILAYAS = ['Alger', 'Oran', 'Constantine', 'Annaba', 'Blida', 'Sétif', 'Tizi Ouzou', 'Béjaïa', 'Batna', 'Boumerdès']
  const displayedWilayas = showAllWilayas ? WILAYAS : PRIORITY_WILAYAS

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: t('settings.navGeneral'), icon: <Settings2 size={14} /> },
    { id: 'identity', label: t('settings.navIdentity'), icon: <Palette size={14} /> },
    { id: 'content', label: t('settings.navContent'), icon: <FileText size={14} /> },
    { id: 'social', label: t('settings.navSocial'), icon: <Share2 size={14} /> },
    { id: 'whatsapp', label: t('settings.navWhatsapp'), icon: <MessageCircle size={14} /> },
    { id: 'notifications', label: t('settings.navNotifications'), icon: <Bell size={14} /> },
    { id: 'delivery', label: t('settings.navDelivery'), icon: <Truck size={14} /> },
    ...(isPro ? [{ id: 'pro' as Tab, label: t('settings.navPro'), icon: <Crown size={14} /> }] : []),
  ]

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-dash-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-3xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-[11px] tracking-[0.09em] uppercase text-dash-accent font-bold">{t('settings.kicker')}</div>
        <h1 className="dash-font-heading font-medium text-[32px] mt-1 text-dash-ink">{t('settings.title')}</h1>
      </motion.div>

      <AnimatePresence>
        {saved && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-dash-success-soft border border-dash-success/20 text-dash-success text-sm px-4 py-3 rounded-xl flex items-center gap-2">
            <Save size={14} /> {t('settings.savedNotice')}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Section navigation — settings is split into focused panels instead of
          one long scrolling page. */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === tab.id
                ? 'bg-dash-accent text-dash-surface shadow-sm'
                : 'bg-dash-surface border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint/40'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
        {!isPro && (
          <button
            onClick={() => setActiveTab('pro')}
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${
              activeTab === 'pro'
                ? 'border-dash-gold-dark bg-dash-gold-soft text-dash-gold-dark'
                : 'border-dash-border bg-dash-surface text-dash-ink-soft hover:text-dash-gold-dark'
            }`}
          >
            <Lock size={14} /> {t('settings.navPro')}
          </button>
        )}
      </div>

      {/* ── Général ── */}
      {activeTab === 'general' && (
        <Card delayMs={40} className="space-y-4">
          <h3 className="text-dash-ink font-bold">{t('settings.generalInfo')}</h3>
          <div>
            <label className={LABEL}>{t('settings.storeName')}</label>
            <input value={form.name} onChange={set('name')} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>{t('settings.slugLabel')}</label>
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border">
              <span className="text-dash-ink-soft text-sm">krenix.store/</span>
              <span className="text-dash-ink text-sm">{store?.slug}</span>
            </div>
            <p className="text-xs text-dash-ink-faint mt-1 flex items-center gap-1">
              <AlertCircle size={11} /> {t('settings.slugImmutable')}
            </p>
          </div>
          <div>
            <label className={LABEL}>{t('settings.welcomeMessage')}</label>
            <textarea value={form.welcomeMessage} onChange={set('welcomeMessage')} rows={2} placeholder={t('settings.welcomeMessagePlaceholder')} className={INPUT_TEXTAREA} />
          </div>
        </Card>
      )}

      {/* ── Identité & médias ── */}
      {activeTab === 'identity' && (
        <Card delayMs={40} className="space-y-4">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-dash-accent" />
            <h3 className="text-dash-ink font-bold">{t('settings.storeIdentity')}</h3>
          </div>
          <div>
            <label className={LABEL}>{t('settings.bioLabel')}</label>
            <textarea value={form.bio} onChange={set('bio')} rows={3} maxLength={200} placeholder={t('settings.bioPlaceholder')} className={INPUT_TEXTAREA} />
            <p className="text-xs text-dash-ink-faint mt-1">{t('settings.bioCharCount', { count: form.bio.length })}</p>
          </div>
          <div>
            <label className={LABEL}>{t('settings.emailLabel')}</label>
            <input type="email" value={form.email} onChange={set('email')} placeholder="contact@maboutique.dz" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>{t('settings.addressLabel')}</label>
            <input value={form.address} onChange={set('address')} placeholder={t('settings.addressPlaceholder')} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>{t('settings.logoLabel')}</label>
            {logoUrl && (
              <div className="mb-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Logo" className="h-16 w-16 object-contain rounded-xl bg-dash-surface-2" />
                <button
                  type="button"
                  onClick={() => removeImage('logo')}
                  disabled={logoUploading}
                  className="text-xs text-dash-danger/70 hover:text-dash-danger transition-colors disabled:opacity-50"
                >
                  {t('settings.removeLogo')}
                </button>
              </div>
            )}
            <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-dash-border text-dash-ink-soft text-sm cursor-pointer hover:border-dash-accent/50 transition-all">
              {logoUploading ? <><span className="w-4 h-4 border-2 border-dash-accent border-t-transparent rounded-full animate-spin" /> {t('settings.uploading')}</> : t('settings.chooseLogo')}
              <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f, 'logo'); e.target.value = '' }} className="hidden" />
            </label>
          </div>
          <div>
            <label className={LABEL}>{t('settings.bannerLabel')}</label>
            {bannerUrl && (
              <div className="mb-3 space-y-2">
                <div className="rounded-xl overflow-hidden" style={{ maxHeight: 120 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={bannerUrl} alt="Bannière" className="w-full object-cover" />
                </div>
                <button
                  type="button"
                  onClick={() => removeImage('banner')}
                  disabled={bannerUploading}
                  className="text-xs text-dash-danger/70 hover:text-dash-danger transition-colors disabled:opacity-50"
                >
                  {t('settings.removeBanner')}
                </button>
              </div>
            )}
            <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-dash-border text-dash-ink-soft text-sm cursor-pointer hover:border-dash-accent/50 transition-all">
              {bannerUploading ? <><span className="w-4 h-4 border-2 border-dash-accent border-t-transparent rounded-full animate-spin" /> {t('settings.uploading')}</> : t('settings.chooseBanner')}
              <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f, 'banner'); e.target.value = '' }} className="hidden" />
            </label>
          </div>
        </Card>
      )}

      {/* ── Contenu ── */}
      {activeTab === 'content' && (
        <div className="space-y-6">
        <div className="rounded-[20px] bg-dash-surface border border-dash-border p-5 mb-4">
          <h3 className="dash-font-heading text-dash-ink font-medium text-lg mb-1">Langue de la boutique</h3>
          <p className="text-dash-ink-soft text-sm mb-4">
            Choisit la langue de la vitrine, des pages produits, des pages générées par l&apos;IA et du formulaire de commande. Le tableau de bord reste en français.
          </p>
          <div className="flex gap-2">
            {(['fr', 'ar'] as const).map((code) => {
              const label = code === 'fr' ? 'Français' : 'العربية'
              const active = form.storeLanguage === code
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    if (code === form.storeLanguage) return
                    // Always warn — safer default than probing whether the store already
                    // has content. The owner dismisses in one click if they haven't
                    // published anything yet.
                    setPendingLangChange(code)
                  }}
                  className={`px-5 py-2 rounded-full text-sm font-medium border transition-colors ${
                    active
                      ? 'bg-dash-accent border-dash-accent text-white'
                      : 'bg-dash-surface-2 border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <p className="text-dash-ink-faint text-xs mt-3">
            Astuce : écrivez vos titres, descriptions et pages dans la langue choisie — la traduction automatique n&apos;est pas activée.
          </p>
        </div>
        <Card delayMs={40} className="space-y-4">
          <div className="flex items-center gap-2">
            <Type size={16} className="text-dash-gold-dark" />
            <h3 className="text-dash-ink font-bold">{t('settings.storeContent')}</h3>
          </div>
          <p className="text-dash-ink-soft text-xs">
            {t('settings.storeContentHint')}
          </p>
          <div><label className={LABEL}>{t('settings.heroHeadline')}</label><input value={form.heroHeadline} onChange={set('heroHeadline')} placeholder={t('settings.heroHeadlinePlaceholder')} className={INPUT} /></div>
          <div><label className={LABEL}>{t('settings.heroSubtitle')}</label><textarea value={form.heroSubtitle} onChange={set('heroSubtitle')} rows={2} placeholder={t('settings.heroSubtitlePlaceholder')} className={INPUT_TEXTAREA} /></div>
          <div><label className={LABEL}>{t('settings.heroCta')}</label><input value={form.heroCta} onChange={set('heroCta')} placeholder={t('settings.heroCtaPlaceholder')} className={INPUT} /></div>
          <div><label className={LABEL}>{t('settings.promoTitle')}</label><input value={form.promoTitle} onChange={set('promoTitle')} placeholder={t('settings.promoTitlePlaceholder')} className={INPUT} /></div>
          <div><label className={LABEL}>{t('settings.footerTagline')}</label><input value={form.footerTagline} onChange={set('footerTagline')} placeholder={t('settings.footerTaglinePlaceholder')} className={INPUT} /></div>
        </Card>
        </div>
      )}

      {/* ── Réseaux sociaux ── */}
      {activeTab === 'social' && (
        <Card delayMs={40} className="space-y-4">
          <h3 className="text-dash-ink font-bold">{t('settings.socialNetworks')}</h3>
          {[
            { key: 'whatsapp', label: 'WhatsApp', placeholder: '0555123456' },
            { key: 'facebook', label: 'Facebook', placeholder: 'facebook.com/maboutique' },
            { key: 'instagram', label: 'Instagram', placeholder: '@maboutique' },
            { key: 'tiktok', label: 'TikTok', placeholder: '@maboutique' },
            { key: 'snapchat', label: 'Snapchat', placeholder: '@maboutique' },
            { key: 'youtube', label: 'YouTube', placeholder: 'youtube.com/@maboutique' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className={LABEL}>{label}</label>
              <input value={form[key as keyof typeof form]} onChange={set(key as keyof typeof form)} placeholder={placeholder} className={INPUT} />
            </div>
          ))}
        </Card>
      )}

      {/* ── Messages WhatsApp ── */}
      {activeTab === 'whatsapp' && (
        <Card delayMs={40} className="space-y-4">
          <button onClick={() => setShowOrderMessages(v => !v)} className="w-full flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageCircle size={16} style={{ color: '#25D366' }} />
              <h3 className="text-dash-ink font-bold">{t('settings.autoWhatsappMessages')}</h3>
            </div>
            {showOrderMessages ? <ChevronUp size={16} className="text-dash-ink-faint" /> : <ChevronDown size={16} className="text-dash-ink-faint" />}
          </button>
          <p className="text-dash-ink-soft text-xs">{t('settings.autoWhatsappHint')}</p>
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-dash-border">
            <div>
              <p className="text-dash-ink text-sm font-medium">{t('settings.whatsappConfirmButton')}</p>
              <p className="text-dash-ink-soft text-xs mt-0.5">{t('settings.whatsappConfirmButtonHint')}</p>
            </div>
            <button
              onClick={toggleWhatsappConfirmEnabled}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${whatsappConfirmEnabled ? 'bg-dash-success' : 'bg-dash-border'}`}
              aria-label={t('settings.whatsappConfirmButton')}
            >
              <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow" style={{ left: whatsappConfirmEnabled ? '22px' : '2px' }} />
            </button>
          </div>
          <div className="text-[11px] text-dash-ink-soft bg-dash-surface-2 rounded-lg px-3 py-2 leading-relaxed">
            {t('settings.availableVariables')}{' '}
            {['{name}', '{order_number}', '{product}', '{total}', '{wilaya}', '{commune}', '{store}'].map(v => (
              <code key={v} className="text-dash-success mr-1">{v}</code>
            ))}
          </div>
          {ORDER_MSG_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className={LABEL}>{label}</label>
              <textarea
                value={orderMessages[key] ?? ''}
                onChange={e => setOrderMessages(m => ({ ...m, [key]: e.target.value }))}
                rows={3}
                placeholder={DEFAULT_ORDER_MESSAGES[key]}
                className={INPUT_TEXTAREA}
              />
            </div>
          ))}
        </Card>
      )}

      {/* ── Notifications ── */}
      {activeTab === 'notifications' && (
        <div className="space-y-6">
        <Card delayMs={40} className="space-y-4">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-dash-warning-dark" />
            <h3 className="text-dash-ink font-bold">{t('settings.notifications')}</h3>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-dash-ink text-sm font-medium">{t('settings.stockAlerts')}</p>
              <p className="text-dash-ink-soft text-xs mt-0.5">
                {t('settings.stockAlertsHint')}
              </p>
            </div>
            <button
              onClick={toggleStockAlerts}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${notifyStockAlerts ? 'bg-dash-success' : 'bg-dash-border'}`}
              aria-label={t('settings.stockAlerts')}
            >
              <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow" style={{ left: notifyStockAlerts ? '22px' : '2px' }} />
            </button>
          </div>
        </Card>

        <TelegramAlertsCard isUltimate={isPro} />
        </div>
      )}

      {/* ── Livraison ── */}
      {activeTab === 'delivery' && (
        <div className="space-y-6">
          <Card delayMs={40} className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck size={16} className="text-dash-accent" />
                <h3 className="text-dash-ink font-bold">{t('settings.deliveryRatesTitle')}</h3>
              </div>
              <button onClick={applyDefaultToAll} className="text-xs text-dash-accent hover:text-dash-accent-dark transition-colors font-semibold">
                {t('settings.applyToAll')}
              </button>
            </div>
            <p className="text-dash-ink-soft text-xs">{t('settings.deliveryRatesHint')}</p>

            <div className="flex bg-dash-surface-2 p-1 rounded-xl">
              {(['flat', 'wilaya'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setDeliveryPricingMode(mode)}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-colors ${
                    deliveryPricingMode === mode ? 'bg-dash-accent text-dash-surface' : 'text-dash-ink-soft hover:text-dash-ink'
                  }`}
                >
                  {mode === 'flat' ? t('settings.modeFlat') : t('settings.modeWilaya')}
                </button>
              ))}
            </div>

            {deliveryPricingMode === 'flat' && (
              <div>
                <label className={LABEL}>{t('settings.deliveryPriceLabel')}</label>
                <input type="number" value={deliveryRates.default ?? 600} onChange={e => setDeliveryRates(r => ({ ...r, default: Number(e.target.value) || 0 }))} placeholder="600" className={INPUT} />
              </div>
            )}

            {deliveryPricingMode === 'wilaya' && (
              <div>
                <label className={LABEL}>{t('settings.perWilayaLabel')}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {displayedWilayas.map(wilaya => (
                    <div key={wilaya} className="flex items-center gap-2">
                      <span className="text-dash-ink-soft text-xs w-24 sm:w-28 truncate flex-shrink-0">{wilaya}</span>
                      <input
                        type="number"
                        value={deliveryRates[wilaya] ?? deliveryRates.default ?? 600}
                        onChange={e => setWilayaRate(wilaya, e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-dash-surface-2 border border-dash-border text-dash-ink text-xs outline-none focus:border-dash-accent/50 transition-all"
                      />
                      <span className="text-dash-ink-faint text-xs flex-shrink-0">DZD</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setShowAllWilayas(v => !v)} className="mt-3 flex items-center gap-1.5 text-xs text-dash-ink-soft hover:text-dash-ink transition-colors">
                  {showAllWilayas ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {showAllWilayas ? t('settings.showLess') : t('settings.showAllWilayas', { count: WILAYAS.length })}
                </button>
              </div>
            )}
          </Card>

          <Card delayMs={80} className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck size={16} className="text-dash-accent" />
                <h3 className="text-dash-ink font-bold">{t('settings.deliveryRatesStopdeskTitle')}</h3>
              </div>
              <button
                onClick={toggleStopdeskEnabled}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${stopdeskEnabled ? 'bg-dash-success' : 'bg-dash-border'}`}
                aria-label={t('settings.stopdeskEnabledLabel')}
              >
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow" style={{ left: stopdeskEnabled ? '22px' : '2px' }} />
              </button>
            </div>
            <p className="text-dash-ink-soft text-xs">{t('settings.stopdeskEnabledHint')}</p>
            <p className="text-dash-ink-soft text-xs">{t('settings.deliveryRatesStopdeskHint')}</p>

            <div className="flex items-center justify-end -mb-2">
              <button onClick={applyStopdeskDefaultToAll} className="text-xs text-dash-accent hover:text-dash-accent-dark transition-colors font-semibold">
                {t('settings.applyToAll')}
              </button>
            </div>

            <div>
              <label className={LABEL}>{t('settings.perWilayaLabel')}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(showAllWilayasStopdesk ? WILAYAS : PRIORITY_WILAYAS).map(wilaya => (
                  <div key={wilaya} className="flex items-center gap-2">
                    <span className="text-dash-ink-soft text-xs w-24 sm:w-28 truncate flex-shrink-0">{wilaya}</span>
                    <input
                      type="number"
                      value={deliveryRatesStopdesk[wilaya] ?? deliveryRatesStopdesk.default ?? 550}
                      onChange={e => setWilayaStopdeskRate(wilaya, e.target.value)}
                      className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-dash-surface-2 border border-dash-border text-dash-ink text-xs outline-none focus:border-dash-accent/50 transition-all"
                    />
                    <span className="text-dash-ink-faint text-xs flex-shrink-0">DZD</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowAllWilayasStopdesk(v => !v)} className="mt-3 flex items-center gap-1.5 text-xs text-dash-ink-soft hover:text-dash-ink transition-colors">
                {showAllWilayasStopdesk ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                {showAllWilayasStopdesk ? t('settings.showLess') : t('settings.showAllWilayas', { count: WILAYAS.length })}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Pro édition (Ultimate+) ── */}
      {activeTab === 'pro' && (
        isPro ? (
          <div className="space-y-6">
            <Card delayMs={40} className="space-y-4 border-dash-gold-dark/30">
              <div className="flex items-center gap-2">
                <Crown size={18} className="text-dash-gold-dark" />
                <h3 className="text-dash-ink font-bold">{t('settings.proTitle')}</h3>
                <span className="ml-auto text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-dash-gold-soft text-dash-gold-dark">Ultimate</span>
              </div>
              <p className="text-dash-ink-soft text-xs leading-relaxed">{t('settings.proHint')}</p>

              <div className="pt-2">
                <p className="text-dash-ink text-sm font-bold mb-1">{t('settings.proSectionsTitle')}</p>
                <p className="text-dash-ink-soft text-xs mb-4">{t('settings.proSectionsHint')}</p>
                <div className="space-y-2.5">
                  {HOMEPAGE_SECTIONS.map(section => (
                    <div key={section.id} className="flex items-center justify-between gap-3 bg-dash-surface-2 rounded-xl px-4 py-3">
                      <div>
                        <p className="text-dash-ink text-sm font-medium">{section.label}</p>
                        <p className="text-dash-ink-faint text-[11px]">{section.hint}</p>
                      </div>
                      <button
                        onClick={() => setHomepage(h => ({ ...h, sections: { ...h.sections, [section.id]: !h.sections[section.id] } }))}
                        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${homepage.sections[section.id] ? 'bg-dash-gold-dark' : 'bg-dash-border'}`}
                        aria-label={section.label}
                      >
                        <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow" style={{ left: homepage.sections[section.id] ? '22px' : '2px' }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-1 space-y-2.5">
                <div className="flex items-center justify-between gap-3 bg-dash-surface-2 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-dash-ink text-sm font-medium flex items-center gap-1.5"><Sparkles size={13} className="text-dash-gold-dark" /> {t('settings.proPhotoSwipe')}</p>
                    <p className="text-dash-ink-faint text-[11px] mt-0.5">{t('settings.proPhotoSwipeHint')}</p>
                  </div>
                  <button
                    onClick={() => setHomepage(h => ({ ...h, photoSwipe: !h.photoSwipe }))}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${homepage.photoSwipe ? 'bg-dash-gold-dark' : 'bg-dash-border'}`}
                    aria-label={t('settings.proPhotoSwipe')}
                  >
                    <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow" style={{ left: homepage.photoSwipe ? '22px' : '2px' }} />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3 bg-dash-surface-2 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-dash-ink text-sm font-medium flex items-center gap-1.5"><Sparkles size={13} className="text-dash-gold-dark" /> {t('settings.proAutoCatalog')}</p>
                    <p className="text-dash-ink-faint text-[11px] mt-0.5">{t('settings.proAutoCatalogHint')}</p>
                  </div>
                  <button
                    onClick={() => setHomepage(h => ({ ...h, autoCatalog: !h.autoCatalog }))}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${homepage.autoCatalog ? 'bg-dash-gold-dark' : 'bg-dash-border'}`}
                    aria-label={t('settings.proAutoCatalog')}
                  >
                    <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow" style={{ left: homepage.autoCatalog ? '22px' : '2px' }} />
                  </button>
                </div>
                <div className="bg-dash-surface-2 rounded-xl px-4 py-3">
                  <p className="text-dash-ink text-sm font-medium flex items-center gap-1.5"><Sparkles size={13} className="text-dash-gold-dark" /> {t('settings.proHeroProduct')}</p>
                  <p className="text-dash-ink-faint text-[11px] mt-0.5 mb-3">{t('settings.proHeroProductHint')}</p>
                  <select
                    value={homepage.heroProductId ?? ''}
                    onChange={e => setHomepage(h => ({ ...h, heroProductId: e.target.value || undefined }))}
                    className={INPUT}
                  >
                    <option value="">{t('settings.proHeroProductAuto')}</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <Card delayMs={40} className="space-y-4">
            <div className="flex items-center gap-2">
              <Lock size={18} className="text-dash-gold-dark" />
              <h3 className="text-dash-ink font-bold">{t('settings.proTitle')}</h3>
            </div>
            <div className="flex flex-col items-center py-8 text-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-dash-gold-soft flex items-center justify-center">
                <Crown size={24} className="text-dash-gold-dark" />
              </div>
              <p className="text-dash-ink font-semibold">{t('settings.proLocked')}</p>
              <p className="text-dash-ink-soft text-sm max-w-sm">{t('settings.proLockedHint')}</p>
            </div>
          </Card>
        )
      )}

      <motion.button
        onClick={handleSave}
        disabled={saving}
        whileTap={{ scale: 0.99 }}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-dash-surface bg-dash-accent hover:bg-dash-accent-dark transition-all disabled:opacity-50"
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : <><Save size={16} /> {t('settings.saveChanges')}</>}
      </motion.button>

      {pendingLangChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="rounded-2xl bg-dash-surface border border-dash-border p-6 max-w-md w-full">
            <h4 className="dash-font-heading text-dash-ink font-medium text-lg mb-2">Changer la langue de la boutique ?</h4>
            <p className="text-dash-ink-soft text-sm mb-5">
              Le contenu existant (produits, pages, messages personnalisés) restera dans la langue où vous l&apos;avez écrit. Vous devrez le récrire si vous souhaitez tout en {pendingLangChange === 'ar' ? 'arabe' : 'français'}.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setPendingLangChange(null)}
                className="px-4 py-2 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink text-sm"
              >Annuler</button>
              <button
                type="button"
                onClick={() => {
                  setForm(f => ({ ...f, storeLanguage: pendingLangChange }))
                  setPendingLangChange(null)
                }}
                className="px-4 py-2 rounded-xl bg-dash-accent text-white text-sm font-medium hover:bg-dash-accent-dark"
              >Continuer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
