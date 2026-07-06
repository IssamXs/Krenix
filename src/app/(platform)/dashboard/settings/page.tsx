'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { Store, OrderMessagesSettings } from '@/types/database'
import { WILAYAS, DEFAULT_DELIVERY_RATES } from '@/lib/wilayas'
import { DEFAULT_ORDER_MESSAGES } from '@/lib/whatsapp'
import { Loader2, Save, AlertCircle, Truck, ChevronDown, ChevronUp, Building2, MessageCircle, Type } from 'lucide-react'

// WhatsApp status-message fields shown in settings (pending has no message).
const ORDER_MSG_FIELDS: { key: keyof OrderMessagesSettings; label: string }[] = [
  { key: 'confirmed',    label: 'Commande confirmée' },
  { key: 'chez_livreur', label: 'Chez le livreur' },
  { key: 'en_livraison', label: 'En cours de livraison' },
  { key: 'livree',       label: 'Commande livrée' },
  { key: 'annulee',      label: 'Commande annulée' },
]

export default function SettingsPage() {
  const router = useRouter()
  const [store, setStore] = useState<Store | null>(null)
  const [form, setForm] = useState({
    name: '',
    whatsapp: '',
    facebook: '',
    instagram: '',
    tiktok: '',
    snapchat: '',
    youtube: '',
    welcomeMessage: '',
    bio: '',
    email: '',
    address: '',
    heroHeadline: '',
    heroSubtitle: '',
    heroCta: '',
    promoTitle: '',
    footerTagline: '',
  })
  const [deliveryRates, setDeliveryRates] = useState<Record<string, number>>({ default: 600 })
  const [orderMessages, setOrderMessages] = useState<OrderMessagesSettings>({})
  const [showOrderMessages, setShowOrderMessages] = useState(false)
  const [showAllWilayas, setShowAllWilayas] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [bannerUploading, setBannerUploading] = useState(false)
  const [bannerUrl, setBannerUrl] = useState('')

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
      })
      setBannerUrl(data.settings?.bannerUrl ?? '')
      setOrderMessages(data.settings?.orderMessages ?? {})
      const existing = data.settings?.deliveryRates
      if (existing && Object.keys(existing).length > 1) {
        setDeliveryRates(existing)
      } else {
        setDeliveryRates({ ...DEFAULT_DELIVERY_RATES })
      }
      setLoading(false)
    })
  }, [router])

  const handleSave = async () => {
    if (!store) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('stores').update({
      name: form.name,
      settings: {
        ...store.settings,
        whatsapp: form.whatsapp,
        facebook: form.facebook,
        instagram: form.instagram,
        tiktok: form.tiktok,
        snapchat: form.snapchat,
        youtube: form.youtube,
        welcomeMessage: form.welcomeMessage,
        bio: form.bio,
        email: form.email,
        address: form.address,
        bannerUrl: bannerUrl || store.settings?.bannerUrl,
        deliveryRates,
        deliveryPrice: deliveryRates.default ?? 600,
        freeDeliveryThreshold: store.settings?.freeDeliveryThreshold ?? 0,
        orderMessages,
        storeContent: {
          heroHeadline: form.heroHeadline,
          heroSubtitle: form.heroSubtitle,
          heroCta: form.heroCta,
          promoTitle: form.promoTitle,
          footerTagline: form.footerTagline,
        },
      },
    }).eq('id', store.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !store) return
    setBannerUploading(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${store.id}/banner.${ext}`
    const { error: upErr } = await supabase.storage.from('store-logos').upload(path, file, { upsert: true })
    if (upErr) { setBannerUploading(false); return }
    const { data: urlData } = supabase.storage.from('store-logos').getPublicUrl(path)
    const url = urlData.publicUrl
    setBannerUrl(url)
    await supabase.from('stores').update({
      settings: { ...store.settings, bannerUrl: url },
    }).eq('id', store.id)
    setBannerUploading(false)
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

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const PRIORITY_WILAYAS = ['Alger', 'Oran', 'Constantine', 'Annaba', 'Blida', 'Sétif', 'Tizi Ouzou', 'Béjaïa', 'Batna', 'Boumerdès']
  const displayedWilayas = showAllWilayas ? WILAYAS : PRIORITY_WILAYAS

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Paramètres</h2>
        <p className="text-gray-500 text-sm mt-1">Configurez votre boutique</p>
      </div>

      {saved && (
        <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <Save size={14} /> Modifications enregistrées !
        </div>
      )}

      {/* Infos générales */}
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-4">
        <h3 className="text-white font-medium">Informations générales</h3>
        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Nom de la boutique</label>
          <input value={form.name} onChange={set('name')}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-[#3B82F6]/50 transition-all" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Adresse (slug)</label>
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10">
            <span className="text-gray-500 text-sm">krenix.com/</span>
            <span className="text-white text-sm">{store?.slug}</span>
          </div>
          <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
            <AlertCircle size={11} /> Le slug ne peut pas être modifié. Contactez le support.
          </p>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Message de bienvenue</label>
          <textarea value={form.welcomeMessage} onChange={set('welcomeMessage')} rows={2}
            placeholder="Bienvenue dans notre boutique !"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all resize-none" />
        </div>
      </div>

      {/* Identité de la boutique */}
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-[#3B82F6]" />
          <h3 className="text-white font-medium">Identité de la boutique</h3>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Bio / Description</label>
          <textarea value={form.bio} onChange={set('bio')} rows={3} maxLength={200}
            placeholder="Boutique spécialisée dans..."
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all resize-none text-sm" />
          <p className="text-xs text-gray-600 mt-1">{form.bio.length}/200 caractères</p>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Email professionnel</label>
          <input type="email" value={form.email} onChange={set('email')}
            placeholder="contact@maboutique.dz"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Adresse physique (optionnel)</label>
          <input value={form.address} onChange={set('address')}
            placeholder="Rue Didouche Mourad, Alger"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Bannière boutique (1200×400px recommandé)</label>
          {bannerUrl && (
            <div className="mb-3 rounded-xl overflow-hidden" style={{ maxHeight: 120 }}>
              <img src={bannerUrl} alt="Bannière" className="w-full object-cover" />
            </div>
          )}
          <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-white/20 text-gray-400 text-sm cursor-pointer hover:border-[#3B82F6]/50 transition-all">
            {bannerUploading
              ? <><span className="w-4 h-4 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" /> Envoi...</>
              : '📷 Choisir une image de bannière'}
            <input type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" />
          </label>
        </div>
      </div>

      {/* Contenu de la boutique */}
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Type size={16} className="text-[#F59E0B]" />
          <h3 className="text-white font-medium">Contenu de la boutique</h3>
        </div>
        <p className="text-gray-500 text-xs">
          Personnalisez les textes principaux de votre page d&apos;accueil.
          Laissez vide pour utiliser le texte par défaut du thème.
        </p>
        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Titre principal (héro)</label>
          <input value={form.heroHeadline} onChange={set('heroHeadline')}
            placeholder="La beauté, révélée"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#F59E0B]/50 transition-all" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Sous-titre (héro)</label>
          <textarea value={form.heroSubtitle} onChange={set('heroSubtitle')} rows={2}
            placeholder="Des produits soigneusement sélectionnés pour sublimer votre quotidien."
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#F59E0B]/50 transition-all resize-none text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Texte du bouton principal</label>
          <input value={form.heroCta} onChange={set('heroCta')}
            placeholder="Découvrir la boutique"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#F59E0B]/50 transition-all" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Titre de la bannière promo</label>
          <input value={form.promoTitle} onChange={set('promoTitle')}
            placeholder="Sublimez votre routine"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#F59E0B]/50 transition-all" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Slogan du pied de page</label>
          <input value={form.footerTagline} onChange={set('footerTagline')}
            placeholder="Une beauté accessible, livrée avec soin partout en Algérie."
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#F59E0B]/50 transition-all" />
        </div>
      </div>

      {/* Réseaux sociaux */}
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-4">
        <h3 className="text-white font-medium">Réseaux sociaux</h3>
        {[
          { key: 'whatsapp',  label: 'WhatsApp',  placeholder: '0555123456' },
          { key: 'facebook',  label: 'Facebook',  placeholder: 'facebook.com/maboutique' },
          { key: 'instagram', label: 'Instagram', placeholder: '@maboutique' },
          { key: 'tiktok',    label: 'TikTok',    placeholder: '@maboutique' },
          { key: 'snapchat',  label: 'Snapchat',  placeholder: '@maboutique' },
          { key: 'youtube',   label: 'YouTube',   placeholder: 'youtube.com/@maboutique' },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">{label}</label>
            <input
              value={form[key as keyof typeof form]}
              onChange={set(key as keyof typeof form)}
              placeholder={placeholder}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all"
            />
          </div>
        ))}
      </div>

      {/* Messages WhatsApp automatiques */}
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-4">
        <button
          onClick={() => setShowOrderMessages(v => !v)}
          className="w-full flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <MessageCircle size={16} style={{ color: '#25D366' }} />
            <h3 className="text-white font-medium">Messages WhatsApp automatiques</h3>
          </div>
          {showOrderMessages ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
        </button>
        <p className="text-gray-500 text-xs">
          Personnalisez les messages envoyés au client à chaque étape de la commande.
          Laissez vide pour utiliser le message par défaut.
        </p>

        {showOrderMessages && (
          <div className="space-y-4">
            <div className="text-[11px] text-gray-500 bg-white/5 rounded-lg px-3 py-2 leading-relaxed">
              Variables disponibles :{' '}
              <code className="text-[#25D366]">{'{name}'}</code>{' '}
              <code className="text-[#25D366]">{'{order_number}'}</code>{' '}
              <code className="text-[#25D366]">{'{product}'}</code>{' '}
              <code className="text-[#25D366]">{'{total}'}</code>{' '}
              <code className="text-[#25D366]">{'{wilaya}'}</code>{' '}
              <code className="text-[#25D366]">{'{commune}'}</code>{' '}
              <code className="text-[#25D366]">{'{store}'}</code>
            </div>
            {ORDER_MSG_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">{label}</label>
                <textarea
                  value={orderMessages[key] ?? ''}
                  onChange={e => setOrderMessages(m => ({ ...m, [key]: e.target.value }))}
                  rows={3}
                  placeholder={DEFAULT_ORDER_MESSAGES[key]}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#25D366]/50 transition-all resize-none text-sm"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tarifs de livraison par wilaya */}
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck size={16} className="text-[#3B82F6]" />
            <h3 className="text-white font-medium">Tarifs de livraison par wilaya</h3>
          </div>
          <button
            onClick={applyDefaultToAll}
            className="text-xs text-[#3B82F6] hover:text-[#93C5FD] transition-colors">
            Appliquer partout
          </button>
        </div>
        <p className="text-gray-500 text-xs">
          Définissez un tarif par défaut et personnalisez wilaya par wilaya.
        </p>

        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Tarif par défaut (DZD)</label>
          <input
            type="number"
            value={deliveryRates.default ?? 600}
            onChange={e => setDeliveryRates(r => ({ ...r, default: Number(e.target.value) || 0 }))}
            placeholder="600"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-3 uppercase tracking-wider">Tarifs individuels par wilaya</label>
          <div className="grid grid-cols-2 gap-2">
            {displayedWilayas.map(wilaya => (
              <div key={wilaya} className="flex items-center gap-2">
                <span className="text-gray-400 text-xs w-28 truncate flex-shrink-0">{wilaya}</span>
                <input
                  type="number"
                  value={deliveryRates[wilaya] ?? deliveryRates.default ?? 600}
                  onChange={e => setWilayaRate(wilaya, e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs outline-none focus:border-[#3B82F6]/50 transition-all"
                />
                <span className="text-gray-600 text-xs flex-shrink-0">DZD</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowAllWilayas(v => !v)}
            className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            {showAllWilayas ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showAllWilayas ? 'Afficher moins' : `Afficher toutes les ${WILAYAS.length} wilayas`}
          </button>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-black transition-all hover:opacity-90 disabled:opacity-50">
        {saving
          ? <Loader2 size={18} className="animate-spin" />
          : <><Save size={16} /> Enregistrer les modifications</>}
      </button>
    </div>
  )
}
