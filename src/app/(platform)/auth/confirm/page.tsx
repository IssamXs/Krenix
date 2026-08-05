'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react'
import KrenixLogo from '@/components/ui/KrenixLogo'
import BackToHomeLink from '@/components/auth/BackToHomeLink'

const EASE = [0.16, 1, 0.3, 1] as const

export default function ConfirmPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') || '/dashboard'

  const handleConfirm = async () => {
    if (!tokenHash || !type) {
      setError('Lien invalide. Redemandez un lien de réinitialisation.')
      return
    }

    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_hash: tokenHash, type }),
    }).then(r => r.json()).catch(() => ({ ok: false, error: 'Erreur réseau. Réessayez.' }))

    if (!res.ok) {
      setError(res.error || 'Ce lien a expiré ou a déjà été utilisé. Redemandez un lien.')
      setLoading(false)
      return
    }

    router.push(next)
  }

  return (
    <div className="min-h-screen bg-dash-page flex items-center justify-center p-4 relative overflow-hidden dash-font-sans">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[620px] h-[420px] rounded-full blur-[130px]" style={{ background: 'var(--color-dash-accent-soft)' }} />
      </div>

      <BackToHomeLink label="Retour à l'accueil" />

      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.82 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.06 }}
            className="flex items-center justify-center gap-2 mb-4"
          >
            <KrenixLogo height={68} compact />
            <span className="font-heading text-[30px] font-extrabold text-dash-ink tracking-tight">Krenix</span>
          </motion.div>
          <h1 className="dash-font-heading text-[26px] font-medium text-dash-ink">Confirmer la demande</h1>
          <p className="text-dash-ink-soft text-sm mt-1">Cliquez ci-dessous pour continuer en toute sécurité</p>
        </div>

        <div className="bg-dash-surface border border-dash-border rounded-[24px] p-8 shadow-[0_24px_60px_-24px_rgba(20,26,33,0.18)] text-center">
          {error && (
            <div className="mb-5 bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-sm px-4 py-3 rounded-xl text-left">
              {error}
            </div>
          )}

          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5 bg-dash-accent-soft border border-dash-accent/20">
            <ShieldCheck size={24} className="text-dash-accent" />
          </div>
          <p className="text-dash-ink-soft text-sm mb-6 leading-relaxed">
            Pour votre sécurité, confirmez cette demande manuellement avant de continuer.
          </p>

          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.99 }}
            onClick={handleConfirm}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm text-white bg-dash-accent hover:bg-dash-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_12px_26px_-12px_var(--color-dash-accent)]"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <>Confirmer <ArrowRight size={16} /></>}
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}
