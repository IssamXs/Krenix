'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Zap, Crown, Rocket, Building2, Globe2, Star, ArrowLeft, ChevronRight } from 'lucide-react'
import { PAYMENT_METHODS } from '@/lib/payment'

// ─── Plan definitions ─────────────────────────────────────────────────────────

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
    badge: '⭐ Recommandé',
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
    missing: ['Domaine personnalisé', 'White label'],
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

// ─── Contact modal ─────────────────────────────────────────────────────────────
function PaymentInstructions({ plan, onClose }: { plan: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
      <div className="bg-[#111118] border border-white/10 rounded-2xl p-7 max-w-md w-full shadow-2xl">
        <h3 className="text-white font-bold text-lg mb-2">Comment passer au plan {plan} ?</h3>
        <p className="text-gray-400 text-sm mb-5">
          Les paiements se font manuellement. Envoyez le montant puis uploadez la preuve ici.
        </p>
        <div className="space-y-3 mb-6">
          {PAYMENT_METHODS.map(m => (
            <div key={m.value} className="flex items-center gap-3 p-3 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.04)' }}>
              <span className="text-xl">{m.icon}</span>
              <div>
                <p className="text-gray-400 text-xs">{m.label} — {m.note}</p>
                <p className="text-white font-mono text-sm font-semibold select-all">{m.value}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-gray-500 text-xs mb-5">
          Incluez votre nom de boutique comme référence. Après paiement, uploadez la capture d&apos;écran dans{' '}
          <Link href="/dashboard/billing" className="text-[#3B82F6] underline">Abonnement</Link>.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-white/5 text-gray-300 hover:bg-white/10 transition-all">
            Fermer
          </button>
          <Link href="/dashboard/billing"
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-center transition-all"
            style={{ background: '#3B82F6', color: '#fff' }}>
            Uploader la preuve
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function UpgradePage() {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)

  return (
    <div className="max-w-5xl space-y-12 pb-16">
      {selectedPlan && (
        <PaymentInstructions plan={selectedPlan} onClose={() => setSelectedPlan(null)} />
      )}

      {/* Back */}
      <Link href="/dashboard/billing"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-white text-sm transition-colors">
        <ArrowLeft size={14} /> Retour à l&apos;abonnement
      </Link>

      {/* Hero */}
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-black text-white">Choisissez votre plan</h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto">
          Tout commence à 15 000 DZD. Upgradez à tout moment, sans engagement.
        </p>
      </div>

      {/* ── Main 3 tiers ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {MAIN_PLANS.map(plan => {
          const Icon = plan.icon
          return (
            <div key={plan.id}
              className={`relative flex flex-col rounded-2xl border transition-all ${
                plan.recommended
                  ? 'border-[#F59E0B] shadow-[0_0_40px_rgba(245,158,11,0.15)]'
                  : 'border-white/10'
              }`}
              style={{ background: plan.recommended ? 'rgba(245,158,11,0.04)' : '#111118' }}>

              {plan.recommended && (
                <div className="absolute -top-4 left-0 right-0 flex justify-center">
                  <span className="px-4 py-1.5 rounded-full text-xs font-black text-black"
                    style={{ background: '#F59E0B' }}>
                    ⭐ Recommandé
                  </span>
                </div>
              )}

              <div className="p-6 flex flex-col gap-4 flex-1">
                {/* Header */}
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

                {/* Price */}
                <div>
                  <span className="text-3xl font-black text-white">{plan.price}</span>
                  <span className="text-gray-500 text-sm ml-1">DZD{plan.period}</span>
                </div>

                {/* Features */}
                <ul className="flex-1 space-y-2.5">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check size={14} className="flex-shrink-0 mt-0.5" style={{ color: plan.color }} />
                      <span className="text-gray-300">{f}</span>
                    </li>
                  ))}
                  {plan.missing.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm opacity-40">
                      <span className="flex-shrink-0 mt-0.5 w-3.5 h-3.5 text-center leading-none">✕</span>
                      <span className="text-gray-500 line-through">{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  onClick={() => setSelectedPlan(plan.name)}
                  className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 mt-2"
                  style={{
                    background: plan.recommended ? '#F59E0B' : '#3B82F6',
                    color: plan.recommended ? '#000' : '#fff',
                  }}>
                  Choisir {plan.name}
                </button>
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
            return (
              <div key={plan.id}
                className="flex flex-col rounded-2xl border border-white/8 bg-[#111118] p-6 gap-4 hover:border-white/15 transition-all">
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

                <button
                  onClick={() => setSelectedPlan(plan.name)}
                  className="w-full py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90"
                  style={{ background: '#3B82F6', color: '#fff' }}>
                  Choisir {plan.name}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Contact section ── */}
      <div className="rounded-2xl p-6 text-center border border-white/8"
        style={{ background: 'rgba(59,130,246,0.04)' }}>
        <p className="text-white font-bold mb-1">Une question avant de choisir ?</p>
        <p className="text-gray-500 text-sm mb-4">
          Notre équipe répond sur WhatsApp — démo live disponible.
        </p>
        <a href="https://wa.me/213XXXXXXXXX"
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90"
          style={{ background: '#25D366', color: '#fff' }}>
          💬 Contacter sur WhatsApp
        </a>
      </div>
    </div>
  )
}
