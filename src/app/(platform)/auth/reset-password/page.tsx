'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, ArrowRight, Loader2, Check } from 'lucide-react'
import KrenixLogo from '@/components/ui/KrenixLogo'

const EASE = [0.16, 1, 0.3, 1] as const

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async () => {
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return }
    if (password !== confirmPassword) { setError('Les mots de passe ne correspondent pas.'); return }

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(
        updateError.message.toLowerCase().includes('session')
          ? 'Le lien a expiré. Redemandez un lien de réinitialisation.'
          : (updateError.message || 'Erreur lors de la mise à jour.'),
      )
      setLoading(false)
      return
    }

    setDone(true)
    setLoading(false)
    setTimeout(() => router.push('/dashboard'), 1800)
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
          <h1 className="dash-font-heading text-[26px] font-medium text-dash-ink">Nouveau mot de passe</h1>
          <p className="text-dash-ink-soft text-sm mt-1">Choisissez un nouveau mot de passe pour votre compte</p>
        </div>

        <div className="bg-dash-surface border border-dash-border rounded-[24px] p-8 shadow-[0_24px_60px_-24px_rgba(20,26,33,0.18)]">
          {done ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-dash-success-soft border border-dash-success/20">
                <Check size={24} className="text-dash-success" />
              </div>
              <p className="text-dash-ink font-semibold text-sm">Mot de passe mis à jour</p>
              <p className="text-dash-ink-soft text-sm mt-1">Redirection vers votre tableau de bord…</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-5 bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-dash-ink-soft mb-2 uppercase tracking-wider">
                    Nouveau mot de passe
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 8 caractères"
                      className="w-full px-4 py-3 pr-12 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-dash-ink-faint hover:text-dash-ink transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-dash-ink-soft mb-2 uppercase tracking-wider">
                    Confirmer le mot de passe
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    placeholder="••••••••"
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
                    <>Mettre à jour <ArrowRight size={16} /></>
                  )}
                </motion.button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
