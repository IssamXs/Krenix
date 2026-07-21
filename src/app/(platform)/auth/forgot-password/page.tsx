'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, Loader2, Mail, ArrowLeft } from 'lucide-react'
import KrenixLogo from '@/components/ui/KrenixLogo'

const EASE = [0.16, 1, 0.3, 1] as const

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async () => {
    if (!email.trim()) { setError('Veuillez entrer votre adresse e-mail.'); return }
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    })

    // Always show the success screen, even on error — never reveal whether an
    // email address is registered (prevents account enumeration via this form).
    if (resetError) console.error('resetPasswordForEmail error:', resetError)
    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-dash-page flex items-center justify-center p-4 relative overflow-hidden dash-font-sans">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[620px] h-[420px] rounded-full blur-[130px]" style={{ background: 'var(--color-dash-accent-soft)' }} />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
          className="w-full max-w-md relative z-10 text-center"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 bg-dash-accent-soft border border-dash-accent/20">
            <Mail size={28} className="text-dash-accent" />
          </div>
          <h1 className="dash-font-heading text-[26px] font-medium text-dash-ink mb-3">
            Vérifiez vos emails
          </h1>
          <p className="text-dash-ink-soft text-sm mb-2">Si un compte existe pour</p>
          <p className="text-dash-ink font-semibold mb-6">{email}</p>
          <p className="text-dash-ink-faint text-xs mb-8 leading-relaxed max-w-xs mx-auto">
            un lien de réinitialisation vient d&apos;être envoyé. Cliquez dessus pour choisir un nouveau mot de passe.
          </p>
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-dash-ink border border-dash-border transition-all hover:bg-dash-surface-2"
          >
            Retour à la connexion
          </Link>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dash-page flex items-center justify-center p-4 relative overflow-hidden dash-font-sans">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[620px] h-[420px] rounded-full blur-[130px]" style={{ background: 'var(--color-dash-accent-soft)' }} />
      </div>

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
            <span className="dash-font-heading text-[30px] font-medium text-dash-ink tracking-tight">Krenix</span>
          </motion.div>
          <h1 className="dash-font-heading text-[26px] font-medium text-dash-ink">Mot de passe oublié</h1>
          <p className="text-dash-ink-soft text-sm mt-1">Entrez votre email pour recevoir un lien de réinitialisation</p>
        </div>

        <div className="bg-dash-surface border border-dash-border rounded-[24px] p-8 shadow-[0_24px_60px_-24px_rgba(20,26,33,0.18)]">
          {error && (
            <div className="mb-5 bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-dash-ink-soft mb-2 uppercase tracking-wider">
                Adresse e-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="votre@email.com"
                className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all"
              />
            </div>

            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.99 }}
              onClick={handleSubmit}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm text-white bg-dash-accent hover:bg-dash-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-[0_12px_26px_-12px_var(--color-dash-accent)]"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>Envoyer le lien <ArrowRight size={16} /></>
              )}
            </motion.button>
          </div>

          <div className="mt-6 pt-5 border-t border-dash-border text-center text-sm text-dash-ink-soft">
            <Link href="/auth/login" className="text-dash-accent hover:text-dash-accent-dark transition-colors font-medium inline-flex items-center gap-1">
              <ArrowLeft size={14} /> Retour à la connexion
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
