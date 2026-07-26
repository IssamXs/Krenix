'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { resolveActiveStore } from '@/lib/active-store'
import { ULTIMATE_PLANS, type Store, type Plan } from '@/types/database'
import { PAYMENT_METHODS } from '@/lib/payment'
import {
  Sparkles, CreditCard, Upload, Loader2, AlertCircle,
  Zap, Rocket, Building2, Globe2, Star, Crown, XCircle, RotateCcw,
} from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import PlanCard, { PlanGrid } from '@/components/dashboard/ui/PlanCard'
import { useI18n } from '@/lib/i18n/LocaleProvider'

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
// Sur-mesure tiers all share the DB value 'sur_mesure' — the super admin
// provisions the actual credit/chatbot numbers manually, inferred here for display.
const SUR_MESURE_TIER_BY_CREDITS: Record<number, string> = {
  200: 'Growth', 400: 'Business', 800: 'Agency', 1500: 'Enterprise',
}

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
    missing: ['Domaine personnalisé'],
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

export default function BillingPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [store, setStore] = useState<Store | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [proofUrl, setProofUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [payingOnline, setPayingOnline] = useState(false)
  const [onlineError, setOnlineError] = useState('')
  const [cancelInfo, setCancelInfo] = useState<{ cancelable: boolean; cancelAtPeriodEnd: boolean; expiresAt: string | null } | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)

  const loadCancelInfo = async () => {
    const res = await fetch('/api/billing/cancel')
    if (res.ok) setCancelInfo(await res.json())
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const data = await resolveActiveStore(supabase, user.id) as Store | null
      if (data) setStore(data)
      setLoading(false)
    })
    loadCancelInfo()
  }, [router])

  const toggleCancel = async (action: 'cancel' | 'resume') => {
    if (action === 'cancel' && !confirm(t('billing.confirmCancel'))) return
    setCancelBusy(true)
    const res = await fetch('/api/billing/cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    })
    if (res.ok) await loadCancelInfo()
    setCancelBusy(false)
  }

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
    const { data: created } = await supabase.from('subscriptions').insert({
      store_id: store.id, plan: selectedPlan, amount_dzd: PLAN_AMOUNTS[selectedPlan] ?? 0,
      status: 'pending', payment_proof_url: proofUrl || null,
    }).select('id').single()
    if (created?.id) {
      fetch('/api/notify/admin-event', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'new_payment', id: created.id }),
      }).catch(() => {})
    }
    setSubmitted(true)
    setSubmitting(false)
  }

  const payOnline = async () => {
    if (!selectedPlan) return
    setPayingOnline(true); setOnlineError('')
    try {
      const res = await fetch('/api/payments/slickpay/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'plan', plan: selectedPlan }),
      })
      const d = await res.json()
      if (!res.ok || !d.checkoutUrl) {
        setOnlineError(d.code === 'NOT_CONFIGURED' ? t('billing.paymentOnlineUnavailable') : (d.error ?? 'Erreur de paiement'))
        setPayingOnline(false)
        return
      }
      window.location.href = d.checkoutUrl
    } catch {
      setOnlineError(t('billing.networkError')); setPayingOnline(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-dash-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const currentPlan = store?.plan ?? 'basic'
  const currentPlanLabel = currentPlan === 'sur_mesure'
    ? (SUR_MESURE_TIER_BY_CREDITS[store?.ai_credits ?? 0] ?? 'Sur Mesure')
    : (PLAN_DISPLAY_NAMES[currentPlan] ?? currentPlan)

  return (
    <div className="max-w-5xl space-y-10 pb-16">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-[11px] tracking-[0.09em] uppercase text-dash-gold-dark font-bold">{t('billing.kicker')}</div>
        <h1 className="dash-font-heading font-medium text-[32px] mt-1 text-dash-ink">{t('billing.title')}</h1>
        <p className="text-dash-ink-soft text-sm mt-2">
          {t('billing.currentPlan')} : <span className="text-dash-ink font-semibold">{currentPlanLabel}</span>
          {' · '}
          <span className="text-dash-accent">{store?.ai_credits ?? 0} {t('billing.creditsRemaining')}</span>
        </p>
      </motion.div>

      {cancelInfo?.cancelable && (
        cancelInfo.cancelAtPeriodEnd ? (
          <Card className="border-dash-warning/30 bg-dash-warning-soft space-y-3">
            <div className="flex items-center gap-2">
              <XCircle size={16} className="text-dash-warning-dark" />
              <h3 className="text-dash-ink font-bold text-sm">{t('billing.subscriptionCanceled')}</h3>
            </div>
            <p className="text-dash-ink-soft text-xs">
              {t('billing.accessUntil')}{' '}
              <span className="text-dash-ink font-semibold">
                {cancelInfo.expiresAt ? new Date(cancelInfo.expiresAt).toLocaleDateString('fr-DZ', { dateStyle: 'long' }) : '—'}
              </span>. {t('billing.notRenewed')}
            </p>
            <button onClick={() => toggleCancel('resume')} disabled={cancelBusy}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-dash-surface border border-dash-border text-dash-ink hover:border-dash-accent/40 transition-all disabled:opacity-50">
              {cancelBusy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} {t('billing.resumeSubscription')}
            </button>
          </Card>
        ) : (
          <Card className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-dash-ink font-bold text-sm">{t('billing.manageSubscription')}</h3>
              <p className="text-dash-ink-soft text-xs mt-1">
                {t('billing.cancelAnytime')}
              </p>
            </div>
            <button onClick={() => toggleCancel('cancel')} disabled={cancelBusy}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-dash-danger-soft border border-dash-danger/20 text-dash-danger hover:bg-dash-danger/15 transition-all disabled:opacity-50 flex-shrink-0">
              {cancelBusy ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />} {t('billing.cancelSubscription')}
            </button>
          </Card>
        )
      )}

      <AnimatePresence>
        {selectedPlan && !submitted && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <Card className="border-dash-accent/30 space-y-5">
              <h3 className="text-dash-ink font-bold flex items-center gap-2">
                <CreditCard size={18} className="text-dash-accent" />
                {t('billing.paymentInstructions')} {PLAN_DISPLAY_NAMES[selectedPlan] ?? selectedPlan}
                <span className="ml-auto text-xs text-dash-accent font-bold whitespace-nowrap">
                  {PLAN_AMOUNTS[selectedPlan]?.toLocaleString('fr-DZ')} DZD{selectedPlan !== 'basic' ? '/mois' : ' (unique)'}
                </span>
              </h3>

              {onlineError && <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-lg">{onlineError}</div>}
              <button onClick={payOnline} disabled={payingOnline}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-dash-surface transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, var(--color-dash-accent), var(--color-dash-accent-dark))' }}>
                {payingOnline ? <Loader2 size={16} className="animate-spin" /> : <><CreditCard size={16} /> {t('billing.payOnline')}</>}
              </button>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-dash-border" />
                <span className="text-dash-ink-faint text-xs">{t('billing.orPayManually')}</span>
                <div className="flex-1 h-px bg-dash-border" />
              </div>

              <div className="bg-dash-surface-2 rounded-xl p-4 space-y-2 text-sm">
                <p className="text-dash-ink font-semibold">{t('billing.payTo')}</p>
                <div className="space-y-2 text-dash-ink-soft">
                  {PAYMENT_METHODS.map(m => (
                    <div key={m.value} className="flex items-center gap-2 flex-wrap">
                      <span>{m.icon}</span>
                      <span className="text-dash-ink font-semibold">{m.label}</span>
                      <span className="text-dash-ink-faint">— {m.note} :</span>
                      <span className="text-dash-ink font-mono font-semibold select-all">{m.value}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-dash-border pt-2 mt-2">
                  <p className="text-dash-ink-faint text-xs flex items-center gap-1 flex-wrap">
                    <AlertCircle size={11} />
                    {t('billing.reference', { slug: store?.slug ?? '' })}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider font-bold">
                  {t('billing.proofLabel')}
                </label>
                <label className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-dash-border hover:border-dash-accent/40 cursor-pointer transition-all">
                  {proofUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proofUrl} alt="Preuve" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-dash-surface-2 flex items-center justify-center flex-shrink-0">
                      {uploading ? <Loader2 size={18} className="animate-spin text-dash-ink-faint" /> : <Upload size={18} className="text-dash-ink-faint" />}
                    </div>
                  )}
                  <div>
                    <p className="text-dash-ink text-sm">{proofUrl ? t('billing.changeProof') : t('billing.addProof')}</p>
                    <p className="text-dash-ink-faint text-xs">PNG, JPG</p>
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={handleProofUpload} />
                </label>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setSelectedPlan(null)} className="px-4 py-3 rounded-xl text-sm font-bold bg-dash-surface-2 text-dash-ink-soft hover:text-dash-ink transition-all">
                  {t('billing.cancelAction')}
                </button>
                <button
                  onClick={handleSubmitPayment}
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-dash-surface bg-dash-accent hover:bg-dash-accent-dark transition-all disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={18} className="animate-spin" /> : <><Zap size={16} /> {t('billing.paymentDone')}</>}
                </button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {submitted && (
        <Card className="border-dash-success/20 bg-dash-success-soft text-center space-y-2">
          <p className="text-dash-success font-bold text-lg">{t('billing.requestSent')}</p>
          <p className="text-dash-ink-soft text-sm">{t('billing.activationNotice')}</p>
          <p className="text-dash-ink-faint text-xs">{t('billing.contactWhatsapp')}</p>
        </Card>
      )}

      <PlanGrid columns={3}>
        {MAIN_PLANS.map((plan, i) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrent={currentPlan === plan.id}
            isRecommended={plan.id === 'ultimate'}
            delayMs={i * 60}
            ctaLabel={selectedPlan === plan.id ? t('billing.selected') : `${t('billing.select')} ${plan.name}`}
            onSelect={plan.id === 'basic' ? undefined : () => setSelectedPlan(plan.id)}
          />
        ))}
      </PlanGrid>

      <div>
        <div className="text-center mb-8">
          <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-dash-purple-soft text-dash-purple">{t('billing.surMesureBadge')}</span>
          <h2 className="dash-font-heading text-[26px] text-dash-ink mt-3">{t('billing.surMesureTitle')}</h2>
          <p className="text-dash-ink-soft text-sm mt-1">{t('billing.surMesureSubtitle')}</p>
        </div>
        <PlanGrid columns={4}>
          {SUR_MESURE_PLANS.map((plan, i) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={currentPlan === plan.id}
              delayMs={i * 60}
              ctaLabel={selectedPlan === plan.id ? t('billing.selected') : `${t('billing.select')} ${plan.name}`}
              onSelect={() => setSelectedPlan(plan.id)}
            />
          ))}
        </PlanGrid>
      </div>

      {store && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-dash-ink font-bold flex items-center gap-2">
              <Sparkles size={15} className="text-dash-accent" /> {t('billing.aiCreditsTitle')}
            </h3>
            {ULTIMATE_PLANS.includes(store.plan as Plan) && (
              <Link href="/dashboard/billing/credits" className="text-xs font-bold px-3 py-1.5 rounded-lg bg-dash-accent-soft text-dash-accent-dark hover:opacity-80 transition-all">
                {t('billing.topUp')}
              </Link>
            )}
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-dash-ink-soft text-sm">{t('billing.creditsLeft')}</span>
            <span className="text-dash-ink font-bold">{store.ai_credits}</span>
          </div>
          {(() => {
            const max = PLAN_MAX_CREDITS[store.plan] ?? 5
            const pct = Math.min(100, (store.ai_credits / max) * 100)
            const barColorClass = store.ai_credits < 5 ? 'bg-dash-danger' : pct < 30 ? 'bg-dash-warning' : 'bg-dash-success'
            return (
              <>
                <div className="h-2 bg-dash-surface-2 rounded-full overflow-hidden">
                  <motion.div className={`h-full rounded-full ${barColorClass}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
                </div>
                <p className="text-dash-ink-faint text-xs mt-2">
                  {store.plan === 'basic' ? t('billing.basicCreditsNote') : `${max} ${t('billing.monthlyCreditsNote')}`}
                </p>
              </>
            )
          })()}
        </Card>
      )}
    </div>
  )
}
