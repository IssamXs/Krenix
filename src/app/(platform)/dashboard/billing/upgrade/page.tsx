'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Crown, Rocket, Building2, Globe2, Star, ArrowLeft } from 'lucide-react'
import { PAYMENT_METHODS } from '@/lib/payment'
import PlanCard, { PlanGrid } from '@/components/dashboard/ui/PlanCard'

const MAIN_PLANS = [
  {
    id: 'basic', name: 'Basic', price: '15 000', period: 'paiement unique', icon: Zap,
    features: ['5 crédits IA (à vie)', 'Boutique en ligne', 'Thème par défaut', '10 produits max', '1 landing page IA (5 crédits/page)', 'Facebook & TikTok Pixel', 'Export Excel commandes'],
    missing: ['Thèmes niches', 'Chatbot IA', 'Domaine personnalisé', 'Landing pages illimitées'],
  },
  {
    id: 'pro', name: 'Pro', price: '3 000', period: '/mois', icon: Rocket,
    features: ['20 crédits IA/mois', '20 produits max', '4 landing pages IA/mois', 'Thème niche Beauty & Fashion inclus', 'Facebook & TikTok Pixel', 'Export Excel commandes', 'Calculateur de profit'],
    missing: ['Chatbot IA', 'Domaine personnalisé'],
  },
  {
    id: 'ultimate', name: 'Ultimate', price: '9 000', period: '/mois', icon: Crown,
    features: ['100 crédits IA/mois', '50 produits max', '20 landing pages IA/mois', 'Tous les 5 thèmes niches', 'Chatbot IA (150 msg/jour)', 'Calculateur de profit', 'Intégrations livraison', "2 membres d'équipe"],
    missing: ['Domaine personnalisé', 'White label'],
  },
]

const SUR_MESURE_PLANS = [
  {
    id: 'growth', name: 'Growth', price: '12 000', period: '/mois', icon: Rocket, tagline: 'Pour les marchands qui veulent scaler',
    features: ['Tout Ultimate +', '200 crédits IA/mois', '100 produits max', 'Chatbot IA 300 msg/jour', 'Domaine personnalisé', "2 membres d'équipe", 'Statistiques de vente avancées', 'Rapport mensuel automatique', 'Support prioritaire par email'],
  },
  {
    id: 'business', name: 'Business', price: '20 000', period: '/mois', icon: Building2, tagline: 'Pour les boutiques sérieuses',
    features: ['Tout Ultimate +', '400 crédits IA/mois', 'Produits illimités', 'Impression étiquettes livraison auto', 'A/B testing landing pages', 'CRM clients & historique achats', 'SMS confirmation automatique', "5 membres d'équipe", '3 domaines personnalisés'],
  },
  {
    id: 'agency', name: 'Agency', price: '35 000', period: '/mois', icon: Globe2, tagline: 'Pour les agences & drop multi-boutiques',
    features: ['Tout Business +', '800 crédits IA/mois', 'Impression étiquettes auto', 'Vue agence — gérer toutes les boutiques en 1 dashboard', '5 boutiques simultanées', 'Membres illimités', 'Accès API', 'Manager de compte dédié'],
  },
  {
    id: 'enterprise', name: 'Enterprise', price: '60 000', period: '/mois', icon: Star, tagline: 'Infrastructure dédiée & développement custom',
    features: ['Tout Agency +', '1 500 crédits IA/mois (affichés comme illimités)', 'Infrastructure dédiée (non partagée)', 'White label complet — votre logo sur la plateforme', 'Boutiques illimitées', 'Développement de fonctionnalités sur mesure', 'SLA garanti 99.9%', 'Ligne directe WhatsApp (prioritaire)'],
  },
]

function PaymentInstructions({ plan, onClose }: { plan: string; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="bg-dash-surface border border-dash-border rounded-2xl p-7 max-w-md w-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-dash-ink font-bold text-lg mb-2">Comment passer au plan {plan} ?</h3>
        <p className="text-dash-ink-soft text-sm mb-5">Les paiements se font manuellement. Envoyez le montant puis uploadez la preuve ici.</p>
        <div className="space-y-3 mb-6">
          {PAYMENT_METHODS.map(m => (
            <div key={m.value} className="flex items-center gap-3 p-3 rounded-xl bg-dash-surface-2">
              <span className="text-xl">{m.icon}</span>
              <div>
                <p className="text-dash-ink-soft text-xs">{m.label} — {m.note}</p>
                <p className="text-dash-ink font-mono text-sm font-semibold select-all">{m.value}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-dash-ink-faint text-xs mb-5">
          Incluez votre nom de boutique comme référence. Après paiement, uploadez la capture d&apos;écran dans{' '}
          <Link href="/dashboard/billing" className="text-dash-accent underline">Abonnement</Link>.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-dash-surface-2 text-dash-ink-soft hover:text-dash-ink transition-all">
            Fermer
          </button>
          <Link href="/dashboard/billing" className="flex-1 py-2.5 rounded-xl text-sm font-bold text-center text-dash-surface bg-dash-accent hover:bg-dash-accent-dark transition-all">
            Uploader la preuve
          </Link>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function UpgradePage() {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)

  return (
    <div className="max-w-5xl space-y-10 pb-16">
      <AnimatePresence>
        {selectedPlan && <PaymentInstructions plan={selectedPlan} onClose={() => setSelectedPlan(null)} />}
      </AnimatePresence>

      <Link href="/dashboard/billing" className="inline-flex items-center gap-2 text-dash-ink-soft hover:text-dash-ink text-sm transition-colors">
        <ArrowLeft size={14} /> Retour à l&apos;abonnement
      </Link>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-3">
        <h1 className="dash-font-heading text-[40px] text-dash-ink">Choisissez votre plan</h1>
        <p className="text-dash-ink-soft text-lg max-w-xl mx-auto">Tout commence à 15 000 DZD. Upgradez à tout moment, sans engagement.</p>
      </motion.div>

      <PlanGrid columns={3}>
        {MAIN_PLANS.map((plan, i) => (
          <PlanCard
            key={plan.id} plan={plan} isCurrent={false} isRecommended={plan.id === 'ultimate'} delayMs={i * 60}
            ctaLabel={`Choisir ${plan.name}`} onSelect={() => setSelectedPlan(plan.name)}
          />
        ))}
      </PlanGrid>

      <div>
        <div className="text-center mb-8">
          <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-dash-purple-soft text-dash-purple">Plans sur mesure</span>
          <h2 className="dash-font-heading text-[26px] text-dash-ink mt-3">Pour aller plus loin</h2>
          <p className="text-dash-ink-soft text-sm mt-1">Intégrations avancées, multi-boutiques, agences &amp; grandes enseignes</p>
        </div>
        <PlanGrid columns={4}>
          {SUR_MESURE_PLANS.map((plan, i) => (
            <PlanCard
              key={plan.id} plan={plan} isCurrent={false} delayMs={i * 60}
              ctaLabel={`Choisir ${plan.name}`} onSelect={() => setSelectedPlan(plan.name)}
            />
          ))}
        </PlanGrid>
      </div>

      <div className="rounded-2xl p-6 text-center border border-dash-border bg-dash-accent-soft/40">
        <p className="text-dash-ink font-bold mb-1">Une question avant de choisir ?</p>
        <p className="text-dash-ink-soft text-sm mb-4">Notre équipe répond sur WhatsApp — démo live disponible.</p>
        <a href="https://wa.me/213XXXXXXXXX" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
          style={{ background: '#25D366' }}>
          💬 Contacter sur WhatsApp
        </a>
      </div>
    </div>
  )
}
