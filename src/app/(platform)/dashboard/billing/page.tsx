'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { resolveActiveStore } from '@/lib/active-store'
import { ULTIMATE_PLANS, type Store, type Plan } from '@/types/database'
import {
  Sparkles, Check, Zap, CreditCard, Upload, Loader2, AlertCircle,
  Crown, Rocket, Building2, Globe2, Star, ChevronRight,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAN_MAX_CREDITS: Record<string, number> = {
  basic: 5, pro: 20, ultimate: 100, growth: 200,
  business: 400, agency: 800, enterprise: 1500, sur_mesure: 999,
}

const PLAN_AMOUNTS: Record<string, number> = {
  pro: 3000, ultimate: 9000, growth: 12000,
  business: 20000, agency: 35000, enterprise: 60000,
}

const PLAN_DISPLAY_NAMES: Record<string, string> = {
  basic: 'Basic', pro: 'Pro', ultimate: 'Ultimate',
  growth: 'Growth', business: 'Business', agency: 'Agency', enterprise: 'Enterprise',
}

// ─── Plan definitions (mirrors upgrade page) ──────────────────────────────────

const MAIN_PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: '15 000',
    period: 'paiement unique',
    credits: '5 crédits IA',
    icon: Zap,
    color: '#6B7280',
    recommended: false,
    features: [
      '5 crédits IA (à vie)',
      'Boutique en ligne',
      'Thème par défaut',
      '10 produits max',
      '1 landing page IA',
      'Export Excel commandes',
    ],
    missing: ['Thèmes niches', 'Chatbot IA', 'Pixels publicitaires', 'Domaine personnalisé', 'Landing pages illimitées'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '3 000',
    period: '/mois',
    credits: '20 crédits IA/mois',
    icon: Rocket,
    color: '#3B82F6',
    recommended: false,
    features: [
      '20 crédits IA/mois',
      'Produits illimités',
      '10 landing pages IA/mois',
      'Thème niche Beauty & Fashion inclus',
      'Export Excel commandes',
      'Calculateur de profit',
    ],
    missing: ['Chatbot IA', 'Pixels publicitaires', 'Domaine personnalisé'],
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    price: '9 000',
    period: '/mois',
    credits: '100 crédits IA/mois',
    icon: Crown,
    color: '#F59E0B',
    recommended: true,
    features: [
      '100 crédits IA/mois',
      'Produits illimités',
      'Landing pages illimitées',
      'Tous les 5 thèmes niches',
      'Chatbot IA (150 msg/jour)',
      'Facebook & TikTok Pixel (manuel)',
      'Calculateur de profit',
      'Intégrations livraison',
      '2 membres d\'équipe',
    ],
    missing: ['Domaine personnalisé'],
  },
]

const SUR_MESURE_PLANS = [
  {
    id: 'growth',
    name: 'Growth',
    price: '12 000',
    period: '/mois',
    icon: Rocket,
    color: '#10B981',
    tagline: 'Pour les marchands qui veulent scaler',
    highlights: [
      'Tout Ultimate +',
      '200 crédits IA/mois',
      'Chatbot IA 300 msg/jour',
      'Domaine personnalisé',
      '2 membres d\'équipe',
      'Statistiques de vente avancées',
      'Rapport mensuel automatique',
      'Support prioritaire par email',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: '20 000',
    period: '/mois',
    icon: Building2,
    color: '#8B5CF6',
    tagline: 'Pour les boutiques sérieuses',
    highlights: [
      'Tout Ultimate +',
      '400 crédits IA/mois',
      'Impression étiquettes livraison auto',
      'A/B testing landing pages',
      'CRM clients & historique achats',
      'SMS confirmation automatique',
      '5 membres d\'équipe',
      '3 domaines personnalisés',
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    price: '35 000',
    period: '/mois',
    icon: Globe2,
    color: '#EF4444',
    tagline: 'Pour les agences & drop multi-boutiques',
    highlights: [
      'Tout Business +',
      '800 crédits IA/mois',
      'Impression étiquettes auto',
      'Vue agence — gérer toutes les boutiques en 1 dashboard',
      '5 boutiques simultanées',
      'Membres illimités',
      'Accès API',
      'Manager de compte dédié',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '60 000',
    period: '/mois',
    icon: Star,
    color: '#F59E0B',
    tagline: 'Infrastructure dédiée & développement custom',
    highlights: [
      'Tout Agency +',
      '1 500 crédits IA/mois (affichés comme illimités)',
      'Infrastructure dédiée (non partagée)',
      'White label complet — votre logo sur la plateforme',
      'Boutiques illimitées',
      'Développement de fonctionnalités sur mesure',
      'SLA garanti 99.9%',
      'Ligne directe WhatsApp (prioritaire)',
    ],
  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const router = useRouter()
  const [store, setStore] = useState<Store | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [proofUrl, setProofUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const data = await resolveActiveStore(supabase, user.id) as Store | null
      if (data) setStore(data)
      setLoading(false)
    })
  }, [router])

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const supabase = createClient()
    const path = `payment-proofs/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const { data, error } = await supabase.storage.from('payment-proofs').upload(path, file)
    if (!error && data) {
      const { data: urlData } = supabase.storage.from('payment-proofs').getPublicUrl(data.path)
      setProofUrl(urlData.publicUrl)
    }
    setUploading(false)
  }

  const handleSubmitPayment = async () => {
    if (!selectedPlan || !store) return
    setSubmitting(true)
    const supabase = createClient()
    await supabase.from('subscriptions').insert({
      store_id: store.id,
      plan: selectedPlan,
      amount_dzd: PLAN_AMOUNTS[selectedPlan] ?? 0,
      status: 'pending',
      payment_proof_url: proofUrl || null,
    })
    setSubmitted(true)
    setSubmitting(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const currentPlan = store?.plan ?? 'basic'

  return (
    <div className="max-w-5xl space-y-12 pb-16">

      {/* ── Current plan status ── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-500 text-sm">
            Plan actuel :{' '}
            <span className="text-white font-semibold">{PLAN_DISPLAY_NAMES[currentPlan] ?? currentPlan}</span>
            {' · '}
            <span className="text-[#3B82F6]">{store?.ai_credits ?? 0} crédits IA restants</span>
          </p>
        </div>
      </div>

      {/* ── Payment form (shown when plan selected) ── */}
      {selectedPlan && !submitted && (
        <div className="bg-[#111118] border border-[#3B82F6]/30 rounded-2xl p-6 space-y-5">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <CreditCard size={18} className="text-[#3B82F6]" />
            Instructions de paiement — Plan {PLAN_DISPLAY_NAMES[selectedPlan] ?? selectedPlan}
            <span className="ml-auto text-xs text-[#3B82F6] font-bold">
              {PLAN_AMOUNTS[selectedPlan]?.toLocaleString('fr-DZ')} DZD
              {selectedPlan !== 'basic' ? '/mois' : ' (unique)'}
            </span>
          </h3>
          <div className="bg-white/5 rounded-xl p-4 space-y-2 text-sm">
            <p className="text-gray-300 font-medium">Effectuez le virement vers :</p>
            <div className="space-y-1 text-gray-400">
              <p>📱 <span className="text-white">BaridiMob</span> — 0023456789</p>
              <p>💳 <span className="text-white">CIB / Edahabia</span> — Sur demande</p>
              <p>🏦 <span className="text-white">Virement bancaire</span> — Sur demande</p>
            </div>
            <div className="border-t border-white/10 pt-2 mt-2">
              <p className="text-gray-500 text-xs flex items-center gap-1">
                <AlertCircle size={11} />
                Incluez votre slug{' '}
                <span className="text-white font-mono">{store?.slug}</span>{' '}
                comme référence de paiement
              </p>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">
              Capture d&apos;écran du paiement (optionnel mais recommandé)
            </label>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-white/15 hover:border-[#3B82F6]/40 cursor-pointer transition-all">
              {proofUrl ? (
                <img src={proofUrl} alt="Preuve" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                  {uploading
                    ? <Loader2 size={18} className="animate-spin text-gray-500" />
                    : <Upload size={18} className="text-gray-500" />}
                </div>
              )}
              <div>
                <p className="text-white text-sm">{proofUrl ? 'Changer la capture' : "Ajouter une capture d'écran"}</p>
                <p className="text-gray-500 text-xs">PNG, JPG</p>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleProofUpload} />
            </label>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setSelectedPlan(null)}
              className="px-4 py-3 rounded-xl text-sm font-semibold bg-white/5 text-gray-400 hover:bg-white/10 transition-all"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmitPayment}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: '#3B82F6', color: '#fff' }}
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <><Zap size={16} /> J&apos;ai effectué le paiement</>}
            </button>
          </div>
        </div>
      )}

      {submitted && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 text-center space-y-2">
          <p className="text-green-400 font-semibold text-lg">Demande envoyée !</p>
          <p className="text-gray-400 text-sm">Votre plan sera activé dans les 24h après vérification du paiement.</p>
          <p className="text-gray-500 text-xs">Contactez-nous sur WhatsApp pour une activation immédiate.</p>
        </div>
      )}

      {/* ── Main 3 tiers ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {MAIN_PLANS.map(plan => {
          const Icon = plan.icon
          const isCurrent = currentPlan === plan.id
          return (
            <div
              key={plan.id}
              className="relative flex flex-col rounded-2xl border transition-all"
              style={{
                border: isCurrent
                  ? '1px solid rgba(16,185,129,0.4)'
                  : plan.recommended
                    ? '1px solid #F59E0B'
                    : '1px solid rgba(255,255,255,0.1)',
                background: isCurrent
                  ? 'rgba(16,185,129,0.04)'
                  : plan.recommended
                    ? 'rgba(245,158,11,0.04)'
                    : '#111118',
                boxShadow: plan.recommended ? '0 0 40px rgba(245,158,11,0.15)' : undefined,
              }}
            >
              {isCurrent && (
                <div className="absolute -top-4 left-0 right-0 flex justify-center">
                  <span className="px-4 py-1.5 rounded-full text-xs font-black"
                    style={{ background: '#10B981', color: '#000' }}>
                    ✓ Plan actuel
                  </span>
                </div>
              )}
              {plan.recommended && !isCurrent && (
                <div className="absolute -top-4 left-0 right-0 flex justify-center">
                  <span className="px-4 py-1.5 rounded-full text-xs font-black text-black"
                    style={{ background: '#F59E0B' }}>
                    ⭐ Recommandé
                  </span>
                </div>
              )}

              <div className="p-6 flex flex-col gap-4 flex-1">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: plan.color + '20' }}>
                    <Icon size={20} style={{ color: plan.color }} />
                  </div>
                  <div>
                    <p className="text-white font-bold">{plan.name}</p>
                    <p className="text-gray-500 text-xs">{plan.credits}</p>
                  </div>
                </div>

                <div>
                  <span className="text-3xl font-black text-white">{plan.price}</span>
                  <span className="text-gray-500 text-sm ml-1">DZD{plan.period}</span>
                </div>

                <ul className="flex-1 space-y-2.5">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check size={14} className="flex-shrink-0 mt-0.5" style={{ color: plan.color }} />
                      <span className="text-gray-300">{f}</span>
                    </li>
                  ))}
                  {plan.missing.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm opacity-40">
                      <span className="flex-shrink-0 mt-0.5 w-3.5 text-center">✕</span>
                      <span className="text-gray-500 line-through">{f}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="w-full py-3 rounded-xl text-sm font-bold text-center"
                    style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.2)' }}>
                    Plan actuel
                  </div>
                ) : plan.id === 'basic' ? (
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 px-1">
                    <AlertCircle size={11} />
                    Première étape requise
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedPlan(plan.id)}
                    className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 mt-2"
                    style={{
                      background: selectedPlan === plan.id
                        ? plan.color
                        : plan.recommended
                          ? '#F59E0B'
                          : '#3B82F6',
                      color: selectedPlan === plan.id
                        ? '#000'
                        : plan.recommended
                          ? '#000'
                          : '#fff',
                    }}
                  >
                    {selectedPlan === plan.id ? '✓ Sélectionné' : `Choisir ${plan.name}`}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Sur Mesure section ── */}
      <div>
        <div className="text-center mb-8">
          <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            Plans sur mesure
          </span>
          <h2 className="text-2xl font-black text-white mt-3">Pour aller plus loin</h2>
          <p className="text-gray-500 text-sm mt-1">
            Intégrations avancées, multi-boutiques, agences & grandes enseignes
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {SUR_MESURE_PLANS.map(plan => {
            const Icon = plan.icon
            const isCurrent = currentPlan === plan.id
            return (
              <div
                key={plan.id}
                className="flex flex-col rounded-2xl p-6 gap-4 transition-all"
                style={{
                  border: isCurrent
                    ? '1px solid rgba(16,185,129,0.4)'
                    : 'rgba(255,255,255,0.08) solid 1px',
                  background: isCurrent ? 'rgba(16,185,129,0.04)' : '#111118',
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: plan.color + '15' }}>
                      <Icon size={18} style={{ color: plan.color }} />
                    </div>
                    <div>
                      <p className="text-white font-bold">{plan.name}</p>
                      <p className="text-gray-500 text-xs">{plan.tagline}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-black text-xl">{plan.price}</p>
                    <p className="text-gray-600 text-xs">DZD{plan.period}</p>
                  </div>
                </div>

                <ul className="space-y-2">
                  {plan.highlights.map(h => (
                    <li key={h} className="flex items-start gap-2 text-sm">
                      <ChevronRight size={13} className="flex-shrink-0 mt-0.5" style={{ color: plan.color }} />
                      <span className="text-gray-400">{h}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="w-full py-2.5 rounded-xl text-sm font-bold text-center"
                    style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.2)' }}>
                    Plan actuel
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedPlan(plan.id)}
                    className="w-full py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90"
                    style={{
                      background: selectedPlan === plan.id ? plan.color : '#3B82F6',
                      color: selectedPlan === plan.id ? '#000' : '#fff',
                    }}
                  >
                    {selectedPlan === plan.id ? '✓ Sélectionné' : `Choisir ${plan.name}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Credits info ── */}
      {store && (
        <div className="bg-[#111118] border border-white/5 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium flex items-center gap-2">
              <Sparkles size={15} className="text-[#3B82F6]" />
              Crédits IA
            </h3>
            {ULTIMATE_PLANS.includes(store.plan as Plan) && (
              <Link href="/dashboard/billing/credits"
                className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all hover:opacity-90"
                style={{ background: 'rgba(59,130,246,0.12)', color: '#3B82F6' }}>
                + Recharger
              </Link>
            )}
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Crédits restants</span>
            <span className="text-white font-bold">{store.ai_credits}</span>
          </div>
          {(() => {
            const max = PLAN_MAX_CREDITS[store.plan] ?? 5
            const pct = Math.min(100, (store.ai_credits / max) * 100)
            const barColor = store.ai_credits < 5 ? '#EF4444' : pct < 30 ? '#F59E0B' : '#10B981'
            return (
              <>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: barColor }} />
                </div>
                <p className="text-gray-600 text-xs mt-2">
                  {store.plan === 'basic'
                    ? '5 crédits inclus (paiement unique, ne se renouvellent pas)'
                    : `${max} crédits renouvelés chaque mois`}
                </p>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
