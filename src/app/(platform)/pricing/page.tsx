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
    badge: null as string | null,
    features: [
      '20 crédits IA/mois',
      "Tout ce qu'il y a dans Basic",
      '8 thèmes premium',
      'Landing pages IA illimitées',
      'Analytics avancé',
      'Support email',
    ],
    highlight: false,
    cta: 'Choisir Pro',
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    price: '9 000',
    period: '/mois',
    badge: 'Recommandé',
    features: [
      '100 crédits IA/mois',
      'Chatbot IA en Darja',
      '150 messages/jour',
      "Tout ce qu'il y a dans Pro",
      'Intégrations livraison',
      'Support prioritaire',
    ],
    highlight: true,
    cta: 'Choisir Ultimate',
  },
]

const SUR_MESURE_PACKAGES = [
  {
    key: 'growth',
    name: 'GROWTH',
    price: '12 000',
    badge: 'Populaire',
    badgeStyle: { background: 'var(--color-dash-info-soft)', color: 'var(--color-dash-info)' },
    features: [
      "Tout ce qu'il y a dans Ultimate",
      '200 crédits IA/mois',
      '300 messages chatbot/jour',
      'Support prioritaire 24h',
    ],
    isGold: false,
    isSelfServe: true,
  },
  {
    key: 'business',
    name: 'BUSINESS',
    price: '20 000',
    badge: 'Le plus complet',
    badgeStyle: { background: 'var(--color-dash-info-soft)', color: 'var(--color-dash-info)' },
    features: [
      "Tout ce qu'il y a dans Growth",
      '400 crédits IA/mois',
      '600 messages chatbot/jour',
      '2 boutiques simultanées',
      'Onboarding personnalisé',
    ],
    isGold: false,
    isSelfServe: false,
  },
  {
    key: 'agency',
    name: 'AGENCY',
    price: '35 000',
    badge: 'Pour agences',
    badgeStyle: { background: 'var(--color-dash-purple-soft)', color: 'var(--color-dash-purple)' },
    features: [
      "Tout ce qu'il y a dans Business",
      '800 crédits IA/mois',
      '1 000 messages chatbot/jour',
      '5 boutiques simultanées',
      'Manager de compte dédié',
    ],
    isGold: false,
    isSelfServe: false,
  },
  {
    key: 'enterprise',
    name: 'ENTERPRISE',
    price: '60 000',
    badge: 'Sur mesure',
    badgeStyle: { background: 'var(--color-dash-neutral-soft)', color: 'var(--color-dash-neutral)' },
    features: [
      "Tout ce qu'il y a dans Agency",
      'Crédits IA illimités',
      'Messages chatbot illimités',
      'Boutiques illimitées',
      'SLA garanti 99.9%',
      'Intégration personnalisée',
    ],
    isGold: false,
    isSelfServe: false,
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
    <div className="min-h-screen bg-dash-page dash-font-sans">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full blur-[140px] opacity-60"
          style={{ background: 'radial-gradient(ellipse, var(--color-dash-accent-soft) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-1/3 right-0 w-[500px] h-[400px] rounded-full blur-[120px] opacity-50"
          style={{ background: 'radial-gradient(ellipse, var(--color-dash-gold-soft) 0%, transparent 70%)' }}
        />
      </div>

      {/* Navbar */}
      <header className="relative z-10 border-b border-dash-border">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-5">
          <Link href="/"><KrenixLogo height={40} /></Link>
          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="text-sm text-dash-ink-soft hover:text-dash-ink transition-colors">
              Se connecter
            </Link>
            <Link
              href="/auth/register"
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, var(--color-dash-accent), var(--color-dash-accent-dark))' }}
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
            className="text-dash-accent-dark text-xs font-bold tracking-widest uppercase mb-4"
          >
            Plans & Tarifs
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="dash-font-heading font-medium text-4xl sm:text-5xl mb-4 leading-tight text-dash-ink"
          >
            Choisissez votre plan
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className="text-dash-ink-soft text-lg max-w-lg mx-auto"
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
              className="relative flex flex-col rounded-[20px] p-6 bg-dash-surface"
              style={{
                border: plan.highlight
                  ? '1px solid var(--color-dash-accent)'
                  : '1px solid var(--color-dash-border)',
                boxShadow: plan.highlight
                  ? '0 20px 50px -20px var(--color-dash-accent)'
                  : 'none',
              }}
            >
              {plan.badge && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase text-white whitespace-nowrap"
                  style={{ background: 'linear-gradient(135deg, var(--color-dash-accent), var(--color-dash-accent-dark))' }}
                >
                  {plan.badge}
                </div>
              )}

              <div className="mb-5">
                <h3 className="text-dash-ink font-bold text-lg mb-3">{plan.name}</h3>
                <div className="flex items-end gap-1.5 mb-0.5">
                  <span className="text-3xl font-black text-dash-ink">{plan.price}</span>
                  <span className="text-dash-ink-faint text-sm mb-1">DZD</span>
                </div>
                <p className="text-dash-ink-faint text-xs">{plan.period}</p>
              </div>

              <ul className="space-y-2.5 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-dash-ink-soft">
                    <Check size={13} className="text-dash-accent flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href="/auth/register"
                className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
                  plan.highlight
                    ? 'text-white hover:opacity-90'
                    : 'text-dash-ink-soft hover:text-dash-ink'
                }`}
                style={
                  plan.highlight
                    ? {
                        background: 'linear-gradient(135deg, var(--color-dash-accent), var(--color-dash-accent-dark))',
                        boxShadow: '0 8px 20px -6px var(--color-dash-accent)',
                      }
                    : { border: '1px solid var(--color-dash-border)' }
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
          className="flex items-start gap-3 px-5 py-4 rounded-xl mb-20 bg-dash-warning-soft"
          style={{ border: '1px solid var(--color-dash-warning)' }}
        >
          <Info size={15} className="text-dash-warning-dark flex-shrink-0 mt-0.5" />
          <p className="text-dash-ink-soft text-sm leading-relaxed">
            <span className="text-dash-warning-dark font-semibold">Prérequis :</span> Le plan{' '}
            <strong className="text-dash-ink">Basic</strong> doit être souscrit en premier. Il constitue la
            base de votre boutique Krenix avant de passer en{' '}
            <strong className="text-dash-ink">Pro</strong> ou{' '}
            <strong className="text-dash-ink">Ultimate</strong>.
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
                style={{ background: 'linear-gradient(to right, transparent, var(--color-dash-gold))' }}
              />
              <span className="text-dash-gold-dark text-[10px] font-bold tracking-widest uppercase px-2">
                Sur Mesure
              </span>
              <div
                className="flex-1 h-px"
                style={{ background: 'linear-gradient(to left, transparent, var(--color-dash-gold))' }}
              />
            </div>

            <h2 className="dash-font-heading font-medium text-3xl sm:text-4xl text-dash-ink mb-3">
              Vous avez besoin de plus&nbsp;?
            </h2>
            <p className="text-dash-ink-soft max-w-xl mx-auto">
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
                className="relative flex flex-col rounded-[20px] p-6 bg-dash-surface"
                style={{
                  border: pkg.isGold
                    ? '1px solid var(--color-dash-gold)'
                    : '1px solid var(--color-dash-border)',
                  boxShadow: pkg.isGold
                    ? '0 20px 50px -20px var(--color-dash-gold)'
                    : 'none',
                }}
              >
                {/* Name + badge row */}
                <div className="flex items-center justify-between mb-4">
                  <h3
                    className="font-black text-sm tracking-wider"
                    style={{ color: pkg.isGold ? 'var(--color-dash-gold-dark)' : 'var(--color-dash-ink)' }}
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
                    <span className="text-2xl font-black text-dash-ink">{pkg.price}</span>
                    <span className="text-dash-ink-faint text-xs mb-1">DZD</span>
                  </div>
                  <p className="text-dash-ink-faint text-xs">/mois</p>
                </div>

                {/* Features */}
                <ul className="space-y-2.5 flex-1 mb-6">
                  {pkg.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-dash-ink-soft leading-snug">
                      <Check
                        size={11}
                        className="flex-shrink-0 mt-0.5"
                        style={{ color: pkg.isGold ? 'var(--color-dash-gold-dark)' : 'var(--color-dash-accent)' }}
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* Action button */}
                {pkg.isSelfServe ? (
                  <Link
                    href="/auth/register"
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase transition-all hover:opacity-90 active:scale-95"
                    style={{
                      background: 'var(--color-dash-surface-2)',
                      border: '1px solid var(--color-dash-border)',
                      color: 'var(--color-dash-ink)',
                    }}
                  >
                    Choisir Growth
                    <ArrowRight size={12} />
                  </Link>
                ) : (
                  <button
                    onClick={() => handleCommander(pkg.name)}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase transition-all hover:opacity-90 active:scale-95"
                    style={
                      pkg.isGold
                        ? {
                            background: 'linear-gradient(135deg, var(--color-dash-gold), var(--color-dash-gold-dark))',
                            color: '#fff',
                            boxShadow: '0 8px 20px -6px var(--color-dash-gold)',
                          }
                        : {
                            background: 'var(--color-dash-surface-2)',
                            border: '1px solid var(--color-dash-border)',
                            color: 'var(--color-dash-ink)',
                          }
                    }
                  >
                    <MessageCircle size={12} />
                    Commander
                  </button>
                )}
              </motion.div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="text-center py-12 border-t border-dash-border">
            <p className="text-dash-ink-faint text-sm mb-5">
              Prêt à lancer votre boutique en ligne ?
            </p>
            <Link
              href="/auth/register"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-sm text-white transition-all hover:opacity-90"
              style={{
                background: 'linear-gradient(135deg, var(--color-dash-accent), var(--color-dash-accent-dark))',
                boxShadow: '0 8px 24px -6px var(--color-dash-accent)',
              }}
            >
              <Zap size={16} />
              Créer ma boutique
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
