'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Check, Info, ArrowRight, Zap, MessageCircle } from 'lucide-react'
import KrenixLogo from '@/components/ui/KrenixLogo'

const STANDARD_PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: '15 000',
    period: 'paiement unique',
    badge: null as string | null,
    features: [
      '5 crédits IA',
      'Boutique en ligne complète',
      '3 thèmes inclus',
      'Produits illimités',
      'Gestion des commandes',
      'Page de remerciement',
    ],
    highlight: false,
    cta: 'Commencer',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '3 000',
    period: '/mois',
    badge: 'Recommandé',
    features: [
      '20 crédits IA/mois',
      "Tout ce qu'il y a dans Basic",
      '8 thèmes premium',
      'Landing pages IA illimitées',
      'Analytics avancé',
      'Support email',
    ],
    highlight: true,
    cta: 'Choisir Pro',
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    price: '9 000',
    period: '/mois',
    badge: null as string | null,
    features: [
      '100 crédits IA/mois',
      'Chatbot IA en Darja',
      '150 messages/jour',
      "Tout ce qu'il y a dans Pro",
      'Intégrations livraison',
      'Support prioritaire',
    ],
    highlight: false,
    cta: 'Choisir Ultimate',
  },
]

const SUR_MESURE_PACKAGES = [
  {
    key: 'growth',
    name: 'GROWTH',
    price: '12 000',
    badge: 'Populaire',
    badgeStyle: { background: 'rgba(59,130,246,0.15)', color: '#60A5FA' },
    features: [
      "Tout ce qu'il y a dans Ultimate",
      '200 crédits IA/mois',
      '300 messages chatbot/jour',
      'Support prioritaire 24h',
    ],
    isGold: false,
  },
  {
    key: 'business',
    name: 'BUSINESS',
    price: '20 000',
    badge: 'Meilleure valeur',
    badgeStyle: { background: 'rgba(245,158,11,0.15)', color: '#F59E0B' },
    features: [
      "Tout ce qu'il y a dans Growth",
      '400 crédits IA/mois',
      '600 messages chatbot/jour',
      '2 boutiques simultanées',
      'Onboarding personnalisé',
    ],
    isGold: true,
  },
  {
    key: 'agency',
    name: 'AGENCY',
    price: '35 000',
    badge: 'Pour agences',
    badgeStyle: { background: 'rgba(168,85,247,0.15)', color: '#C084FC' },
    features: [
      "Tout ce qu'il y a dans Business",
      '800 crédits IA/mois',
      '1 000 messages chatbot/jour',
      '5 boutiques simultanées',
      'Manager de compte dédié',
    ],
    isGold: false,
  },
  {
    key: 'enterprise',
    name: 'ENTERPRISE',
    price: '60 000',
    badge: 'Sur mesure',
    badgeStyle: { background: 'rgba(255,255,255,0.06)', color: '#9CA3AF' },
    features: [
      "Tout ce qu'il y a dans Agency",
      'Crédits IA illimités',
      'Messages chatbot illimités',
      'Boutiques illimitées',
      'SLA garanti 99.9%',
      'Intégration personnalisée',
    ],
    isGold: false,
  },
]

export default function PricingPage() {
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '213XXXXXXXXX'

  const handleCommander = (packageName: string) => {
    const msg = encodeURIComponent(
      `Bonjour, je suis intéressé(e) par le forfait ${packageName} de Krenix. Pouvez-vous m'en dire plus ?`
    )
    window.open(`https://wa.me/${whatsappNumber}?text=${msg}`, '_blank')
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full blur-[140px] opacity-25"
          style={{ background: 'radial-gradient(ellipse, #3B82F6 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-1/3 right-0 w-[500px] h-[400px] rounded-full blur-[120px] opacity-15"
          style={{ background: 'radial-gradient(ellipse, #F59E0B 0%, transparent 70%)' }}
        />
      </div>

      {/* Navbar */}
      <header className="relative z-10 border-b border-white/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-5">
          <Link href="/"><KrenixLogo height={28} color="#fff" /></Link>
          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="text-sm text-gray-400 hover:text-white transition-colors">
              Se connecter
            </Link>
            <Link
              href="/auth/register"
              className="px-4 py-2 rounded-xl text-sm font-semibold text-black transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #3B82F6, #2563EB)' }}
            >
              Créer une boutique
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-14">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[#3B82F6] text-xs font-bold tracking-widest uppercase mb-4"
          >
            Plans & Tarifs
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="text-4xl sm:text-5xl font-black mb-4 leading-tight"
          >
            Choisissez votre plan
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className="text-gray-400 text-lg max-w-lg mx-auto"
          >
            Des tarifs simples, transparents et adaptés au marché algérien.
          </motion.p>
        </div>

        {/* ── Standard Plans ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
          {STANDARD_PLANS.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.09 + 0.2 }}
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
              className="relative flex flex-col rounded-2xl p-6"
              style={{
                background: plan.highlight
                  ? 'linear-gradient(145deg, #111120 0%, #0D1025 100%)'
                  : '#111118',
                border: plan.highlight
                  ? '1px solid rgba(59,130,246,0.35)'
                  : '1px solid rgba(255,255,255,0.06)',
                boxShadow: plan.highlight
                  ? '0 0 50px rgba(59,130,246,0.07)'
                  : 'none',
              }}
            >
              {plan.badge && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase text-black whitespace-nowrap"
                  style={{ background: 'linear-gradient(135deg, #3B82F6, #2563EB)' }}
                >
                  {plan.badge}
                </div>
              )}

              <div className="mb-5">
                <h3 className="text-white font-bold text-lg mb-3">{plan.name}</h3>
                <div className="flex items-end gap-1.5 mb-0.5">
                  <span className="text-3xl font-black text-white">{plan.price}</span>
                  <span className="text-gray-500 text-sm mb-1">DZD</span>
                </div>
                <p className="text-gray-500 text-xs">{plan.period}</p>
              </div>

              <ul className="space-y-2.5 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-gray-300">
                    <Check size={13} className="text-[#3B82F6] flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href="/auth/register"
                className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
                  plan.highlight
                    ? 'text-black hover:opacity-90'
                    : 'text-gray-300 hover:text-white'
                }`}
                style={
                  plan.highlight
                    ? {
                        background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                        boxShadow: '0 4px 15px rgba(59,130,246,0.3)',
                      }
                    : { border: '1px solid rgba(255,255,255,0.1)' }
                }
              >
                {plan.cta}
                <ArrowRight size={14} />
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Prerequisite note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
          className="flex items-start gap-3 px-5 py-4 rounded-xl mb-20"
          style={{
            background: 'rgba(245,158,11,0.05)',
            border: '1px solid rgba(245,158,11,0.15)',
          }}
        >
          <Info size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-amber-300/75 text-sm leading-relaxed">
            <span className="text-amber-400 font-semibold">Prérequis :</span> Le plan{' '}
            <strong className="text-amber-300">Basic</strong> doit être souscrit en premier. Il constitue la
            base de votre boutique Krenix avant de passer en{' '}
            <strong className="text-amber-300">Pro</strong> ou{' '}
            <strong className="text-amber-300">Ultimate</strong>.
          </p>
        </motion.div>

        {/* ── Sur Mesure Section ── */}
        <div>
          {/* Section header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <div className="flex items-center gap-4 mb-10">
              <div
                className="flex-1 h-px"
                style={{ background: 'linear-gradient(to right, transparent, rgba(245,158,11,0.25))' }}
              />
              <span className="text-amber-400/60 text-[10px] font-bold tracking-widest uppercase px-2">
                Sur Mesure
              </span>
              <div
                className="flex-1 h-px"
                style={{ background: 'linear-gradient(to left, transparent, rgba(245,158,11,0.25))' }}
              />
            </div>

            <h2 className="text-3xl sm:text-4xl font-black text-white mb-3">
              Vous avez besoin de plus&nbsp;?
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              Des formules pensées pour les grandes boutiques et les agences algériennes.
            </p>
          </motion.div>

          {/* Sur Mesure cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-20">
            {SUR_MESURE_PACKAGES.map((pkg, i) => (
              <motion.div
                key={pkg.key}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                whileHover={{ y: -8, transition: { duration: 0.2 } }}
                className="relative flex flex-col rounded-2xl p-6"
                style={{
                  background: pkg.isGold
                    ? 'linear-gradient(145deg, #161208 0%, #120E05 100%)'
                    : '#111118',
                  border: pkg.isGold
                    ? '1px solid rgba(245,158,11,0.45)'
                    : '1px solid rgba(255,255,255,0.06)',
                  boxShadow: pkg.isGold
                    ? '0 0 60px rgba(245,158,11,0.07), inset 0 1px 0 rgba(245,158,11,0.04)'
                    : 'none',
                }}
              >
                {/* Name + badge row */}
                <div className="flex items-center justify-between mb-4">
                  <h3
                    className="font-black text-sm tracking-wider"
                    style={{ color: pkg.isGold ? '#F59E0B' : '#fff' }}
                  >
                    {pkg.name}
                  </h3>
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={pkg.badgeStyle}
                  >
                    {pkg.badge}
                  </span>
                </div>

                {/* Price */}
                <div className="mb-5">
                  <div className="flex items-end gap-1.5">
                    <span className="text-2xl font-black text-white">{pkg.price}</span>
                    <span className="text-gray-500 text-xs mb-1">DZD</span>
                  </div>
                  <p className="text-gray-500 text-xs">/mois</p>
                </div>

                {/* Features */}
                <ul className="space-y-2.5 flex-1 mb-6">
                  {pkg.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-gray-300 leading-snug">
                      <Check
                        size={11}
                        className="flex-shrink-0 mt-0.5"
                        style={{ color: pkg.isGold ? '#F59E0B' : '#3B82F6' }}
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* Commander button */}
                <button
                  onClick={() => handleCommander(pkg.name)}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase transition-all hover:opacity-90 active:scale-95"
                  style={
                    pkg.isGold
                      ? {
                          background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                          color: '#000',
                          boxShadow: '0 4px 15px rgba(245,158,11,0.3)',
                        }
                      : {
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.09)',
                          color: '#fff',
                        }
                  }
                >
                  <MessageCircle size={12} />
                  Commander
                </button>
              </motion.div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div
            className="text-center py-12 border-t"
            style={{ borderColor: 'rgba(255,255,255,0.05)' }}
          >
            <p className="text-gray-500 text-sm mb-5">
              Prêt à lancer votre boutique en ligne ?
            </p>
            <Link
              href="/auth/register"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-sm text-black transition-all hover:opacity-90"
              style={{
                background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                boxShadow: '0 4px 20px rgba(59,130,246,0.35)',
              }}
            >
              <Zap size={16} />
              Créer ma boutique gratuitement
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
