'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react'
import KrenixLogo from '@/components/ui/KrenixLogo'
import OAuthButtons from '@/components/auth/OAuthButtons'

const EASE = [0.16, 1, 0.3, 1] as const

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Veuillez remplir tous les champs.')
      return
    }
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError || !authData.user) {
      setError('Email ou mot de passe incorrect.')
      setLoading(false)
      return
    }

    // Look at the owner's EARLIEST (primary) store. Must use owner filter +
    // order + limit + maybeSingle — .single() throws for owners with 2+ stores
    // (Agency / multi-boutique), which used to force everyone back into onboarding.
    const { data: store } = await supabase
      .from('stores')
      .select('id, is_onboarded')
      .eq('owner_id', authData.user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!store || !store.is_onboarded) {
      router.push('/onboarding/step-1')
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-dash-page flex items-center justify-center p-4 relative overflow-hidden dash-font-sans">
      {/* Soft Éclat glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[620px] h-[420px] rounded-full blur-[130px]" style={{ background: 'var(--color-dash-accent-soft)' }} />
        <div className="absolute bottom-0 right-1/5 w-[340px] h-[340px] rounded-full blur-[120px]" style={{ background: 'var(--color-dash-gold-soft)' }} />
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
          <h1 className="dash-font-heading text-[26px] font-medium text-dash-ink">Bon retour</h1>
          <p className="text-dash-ink-soft text-sm mt-1">Connectez-vous à votre boutique</p>
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
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
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
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="••••••••"
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

            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.99 }}
              onClick={handleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm text-white bg-dash-accent hover:bg-dash-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-[0_12px_26px_-12px_var(--color-dash-accent)]"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>Se connecter <ArrowRight size={16} /></>
              )}
            </motion.button>
          </div>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-dash-border" />
            <span className="text-dash-ink-faint text-xs">ou continuer avec</span>
            <div className="flex-1 h-px bg-dash-border" />
          </div>

          <OAuthButtons />

          <div className="mt-6 pt-5 border-t border-dash-border text-center text-sm text-dash-ink-soft">
            Pas encore de compte ?{' '}
            <Link href="/auth/register" className="text-dash-accent hover:text-dash-accent-dark transition-colors font-medium">
              Créer votre boutique
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
