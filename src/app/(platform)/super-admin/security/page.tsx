'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, ShieldCheck, Shield } from 'lucide-react'

export default function SuperAdminSecurity() {
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [aal2, setAal2] = useState(false)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]).then(([factors, level]) => {
      const verified = factors.data?.totp?.find(f => f.status === 'verified')
      setFactorId(verified?.id ?? null)
      setAal2(level.data?.currentLevel === 'aal2')
      setLoading(false)
    })
  }, [supabase])

  const startEnroll = async () => {
    setBusy(true); setError('')
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    if (error || !data) { setError('Échec de l’inscription'); setBusy(false); return }
    setEnrollFactorId(data.id); setQr(data.totp.qr_code); setBusy(false)
  }

  const verifyEnroll = async () => {
    if (!enrollFactorId) return
    setBusy(true); setError('')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollFactorId, code })
    if (error) { setError('Code incorrect'); setBusy(false); return }
    setBusy(false); router.push('/super-admin')
  }

  const verifyChallenge = async () => {
    if (!factorId) return
    setBusy(true); setError('')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    if (error) { setError('Code incorrect'); setBusy(false); return }
    setBusy(false); router.push('/super-admin')
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-gray-500" /></div>

  // Verified factor but not yet AAL2 this session → challenge to step up.
  if (factorId && !aal2) {
    return (
      <div className="max-w-sm mx-auto space-y-4 py-10">
        <div className="flex items-center gap-2"><ShieldCheck size={20} className="text-green-400" /><h1 className="text-xl font-bold text-white">Vérification 2FA</h1></div>
        <p className="text-gray-500 text-sm">Entrez le code de votre application d’authentification.</p>
        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-lg">{error}</div>}
        <input value={code} autoFocus onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && verifyChallenge()}
          placeholder="123456" inputMode="numeric" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none text-center tracking-widest text-lg" />
        <button onClick={verifyChallenge} disabled={busy || code.length < 6} className="w-full py-3 rounded-xl bg-green-500 text-black font-semibold text-sm disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Vérifier'}
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-md space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Sécurité (2FA)</h1><p className="text-gray-500 text-sm mt-1">Authentification à deux facteurs</p></div>
      {factorId ? (
        <div className="bg-[#111118] border border-green-500/20 rounded-2xl p-6 flex items-center gap-3">
          <ShieldCheck size={22} className="text-green-400" />
          <div><p className="text-white font-semibold text-sm">2FA activée</p><p className="text-gray-500 text-xs">Votre compte est protégé par une application d’authentification.</p></div>
        </div>
      ) : (
        <div className="bg-[#111118] border border-white/10 rounded-2xl p-6 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-lg">{error}</div>}
          {!qr ? (
            <>
              <div className="flex items-center gap-2"><Shield size={18} className="text-amber-400" /><p className="text-white font-semibold text-sm">Activez la 2FA pour continuer</p></div>
              <p className="text-gray-500 text-xs">Requis pour accéder au panneau super admin.</p>
              <button onClick={startEnroll} disabled={busy} className="w-full py-3 rounded-xl bg-[#3B82F6] text-black font-semibold text-sm disabled:opacity-50">
                {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Commencer'}
              </button>
            </>
          ) : (
            <>
              <p className="text-gray-400 text-xs">Scannez ce QR avec Google Authenticator / Authy, puis entrez le code :</p>
              {/* qr_code is an SVG data URL */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR 2FA" className="w-44 h-44 mx-auto rounded-xl bg-white p-2" />
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="123456" inputMode="numeric"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none text-center tracking-widest text-lg" />
              <button onClick={verifyEnroll} disabled={busy || code.length < 6} className="w-full py-3 rounded-xl bg-green-500 text-black font-semibold text-sm disabled:opacity-50">
                {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Activer la 2FA'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
