'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, ArrowRight, Loader2, Check, Mail } from 'lucide-react'
import KrenixLogo from '@/components/ui/KrenixLogo'
import OAuthButtons from '@/components/auth/OAuthButtons'

const EASE = [0.16, 1, 0.3, 1] as const

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  const handleRegister = async () => {
    if (!email || !password || !confirmPassword) {
      setError('Veuillez remplir tous les champs.')
      return
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (authError) {
      if (authError.message.includes('already registered') || authError.message.includes('User already registered')) {
        setError('Cet email est déjà utilisé. Connectez-vous.')
      } else if (authError.message.toLowerCase().includes('rate limit') || authError.message.includes('over_email_send_rate_limit')) {
        setError('Trop de tentatives. Veuillez patienter quelques minutes avant de réessayer.')
      } else {
        setError(authError.message || 'Erreur lors de la création du compte. Réessayez.')
      }
      setLoading(false)
      return
    }

    // Session exists immediately (email confirmation disabled in Supabase) → go to onboarding
    if (data.session) {
      router.push('/onboarding/step-1')
      return
    }

    // Email confirmation required → show success screen
    setEmailSent(true)
    setLoading(false)
  }

  const passwordStrength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3

  if (emailSent) {
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
          <p className="text-dash-ink-soft text-sm mb-2">Un lien de confirmation a été envoyé à</p>
          <p className="text-dash-ink font-semibold mb-6">{email}</p>
          <p className="text-dash-ink-faint text-xs mb-8 leading-relaxed max-w-xs mx-auto">
            Cliquez sur le lien dans l&apos;email pour activer votre compte et accéder à votre tableau de bord.
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
        <div className="absolute bottom-0 left-1/5 w-[340px] h-[340px] rounded-full blur-[120px]" style={{ background: 'var(--color-dash-gold-soft)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.82 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.06 }}
            className="flex items-center justify-center gap-2 mb-4"
          >
            <KrenixLogo height={68} compact />
            <span className="dash-font-heading text-[30px] font-medium text-dash-ink tracking-tight">Krenix</span>
          </motion.div>
          <h1 className="dash-font-heading text-[26px] font-medium text-dash-ink">Créez votre boutique</h1>
          <p className="text-dash-ink-soft text-sm mt-1">Lancez votre e-commerce en quelques minutes</p>
        </div>

        <div className="flex items-center justify-center gap-4 mb-6 flex-wrap">
          {['Configuration en 5 min', 'Boutique en ligne', 'IA intégrée'].map((benefit) => (
            <div key={benefit} className="flex items-center gap-1.5 text-xs text-dash-ink-soft">
              <Check size={12} className="text-dash-accent" />
              {benefit}
            </div>
          ))}
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
                placeholder="votre@email.com"
                className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-dash-ink-soft mb-2 uppercase tracking-wider">
                Mot de passe
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
              {password.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {[1, 2, 3].map((level) => (
                    <div
                      key={level}
                      className="h-1 flex-1 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: passwordStrength >= level
                          ? level === 1 ? 'var(--color-dash-danger)' : level === 2 ? 'var(--color-dash-gold)' : 'var(--color-dash-success)'
                          : 'var(--color-dash-border)'
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-dash-ink-soft mb-2 uppercase tracking-wider">
                Confirmer le mot de passe
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                placeholder="••••••••"
                className={`w-full px-4 py-3 rounded-xl bg-dash-surface-2 border text-dash-ink placeholder-dash-ink-faint outline-none transition-all ${
                  confirmPassword && confirmPassword !== password
                    ? 'border-dash-danger/50'
                    : confirmPassword && confirmPassword === password
                    ? 'border-dash-success/50'
                    : 'border-dash-border focus:border-dash-accent/50'
                }`}
              />
            </div>

            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.99 }}
              onClick={handleRegister}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm text-white bg-dash-accent hover:bg-dash-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-[0_12px_26px_-12px_var(--color-dash-accent)]"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>Créer mon compte <ArrowRight size={16} /></>
              )}
            </motion.button>
          </div>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-dash-border" />
            <span className="text-dash-ink-faint text-xs">ou s&apos;inscrire avec</span>
            <div className="flex-1 h-px bg-dash-border" />
          </div>

          <OAuthButtons />

          <div className="mt-6 pt-5 border-t border-dash-border text-center text-sm text-dash-ink-soft">
            Déjà un compte ?{' '}
            <Link href="/auth/login" className="text-dash-accent hover:text-dash-accent-dark transition-colors font-medium">
              Se connecter
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
