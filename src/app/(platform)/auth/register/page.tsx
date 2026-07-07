'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, ArrowRight, Loader2, Check, Mail } from 'lucide-react'
import KrenixLogo from '@/components/ui/KrenixLogo'
import OAuthButtons from '@/components/auth/OAuthButtons'

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
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[120px]"
            style={{ background: 'rgba(59,130,246,0.06)' }} />
        </div>
        <div className="w-full max-w-md relative z-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
            style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}>
            <Mail size={28} className="text-[#3B82F6]" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3" style={{ fontFamily: 'var(--font-heading)' }}>
            Vérifiez vos emails
          </h1>
          <p className="text-gray-400 text-sm mb-2">Un lien de confirmation a été envoyé à</p>
          <p className="text-white font-semibold mb-6">{email}</p>
          <p className="text-gray-500 text-xs mb-8 leading-relaxed max-w-xs mx-auto">
            Cliquez sur le lien dans l'email pour activer votre compte et accéder à votre tableau de bord.
          </p>
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-70"
            style={{ border: '1px solid rgba(255,255,255,0.12)' }}
          >
            Retour à la connexion
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[120px]"
          style={{ background: 'rgba(59,130,246,0.06)' }} />
        <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] rounded-full blur-[100px]"
          style={{ background: 'rgba(37,99,235,0.05)' }} />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <KrenixLogo height={40} color="#fff" />
          </div>
          <p className="text-gray-500 text-sm mt-2">Créez votre boutique en ligne</p>
        </div>

        <div className="flex items-center justify-center gap-4 mb-6 flex-wrap">
          {['Configuration en 5 min', 'Boutique en ligne', 'IA intégrée'].map((benefit) => (
            <div key={benefit} className="flex items-center gap-1.5 text-xs text-gray-400">
              <Check size={12} className="text-[#3B82F6]" />
              {benefit}
            </div>
          ))}
        </div>

        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 shadow-2xl">
          {error && (
            <div className="mb-5 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                Adresse e-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 caractères"
                  className="w-full px-4 py-3 pr-12 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
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
                          ? level === 1 ? '#EF4444' : level === 2 ? '#3B82F6' : '#22C55E'
                          : 'rgba(255,255,255,0.1)'
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                Confirmer le mot de passe
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                placeholder="••••••••"
                className={`w-full px-4 py-3 rounded-xl bg-white/5 border text-white placeholder-gray-600 outline-none transition-all ${
                  confirmPassword && confirmPassword !== password
                    ? 'border-red-500/50'
                    : confirmPassword && confirmPassword === password
                    ? 'border-green-500/50'
                    : 'border-white/10 focus:border-[#3B82F6]/50'
                }`}
              />
            </div>

            <button
              onClick={handleRegister}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              style={{ background: 'linear-gradient(135deg, #3B82F6, #2563EB)', boxShadow: '0 4px 20px rgba(59,130,246,0.35)' }}
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>Créer mon compte <ArrowRight size={16} /></>
              )}
            </button>
          </div>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-gray-600 text-xs">ou s&apos;inscrire avec</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <OAuthButtons />

          <div className="mt-6 pt-5 border-t border-white/5 text-center text-sm text-gray-500">
            Déjà un compte ?{' '}
            <Link href="/auth/login" className="text-[#3B82F6] hover:text-[#93C5FD] transition-colors font-medium">
              Se connecter
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
