'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, ShieldCheck, Shield, ShieldAlert } from 'lucide-react'

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
  const [useBackupCodes, setUseBackupCodes] = useState(false)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [showBackupCodes, setShowBackupCodes] = useState(false)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [savingRecovery, setSavingRecovery] = useState(false)
  const [recoverySaved, setRecoverySaved] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      fetch('/api/super-admin/recovery-methods').then(r => r.json()).catch(() => ({}))
    ]).then(([factors, level, recovery]) => {
      const verified = factors.data?.totp?.find(f => f.status === 'verified')
      setFactorId(verified?.id ?? null)
      setAal2(level.data?.currentLevel === 'aal2')
      if (recovery.phone) setPhone(recovery.phone)
      if (recovery.email) setEmail(recovery.email)
      setLoading(false)
    })
  }, [supabase])

  const startEnroll = async () => {
    setBusy(true); setError('')
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    if (error || !data) { setError('Échec de l’inscription'); setBusy(false); return }
    
    // Generate backup codes
    const bcRes = await fetch('/api/super-admin/backup-codes', { method: 'POST' })
    if (bcRes.ok) {
      const { codes } = await bcRes.json()
      setBackupCodes(codes)
    }

    setEnrollFactorId(data.id); setQr(data.totp.qr_code); setBusy(false)
  }

  const verifyEnroll = async () => {
    if (!enrollFactorId) return
    setBusy(true); setError('')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollFactorId, code })
    if (error) { setError('Code incorrect'); setBusy(false); return }
    setBusy(false); router.refresh(); router.push('/super-admin')
  }

  const verifyChallenge = async () => {
    if (!factorId) return
    setBusy(true); setError('')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    if (error) { setError('Code incorrect'); setBusy(false); return }
    setBusy(false); router.refresh(); router.push('/super-admin')
  }

  const verifyBackupCode = async () => {
    setBusy(true); setError('')
    const res = await fetch('/api/super-admin/verify-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    })
    if (!res.ok) { setError('Code incorrect ou déjà utilisé'); setBusy(false); return }
    setBusy(false); router.refresh(); router.push('/super-admin')
  }

  const saveRecoveryMethods = async () => {
    setSavingRecovery(true)
    const res = await fetch('/api/super-admin/recovery-methods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, email })
    })
    setSavingRecovery(false)
    if (res.ok) {
      setRecoverySaved(true)
      setTimeout(() => setRecoverySaved(false), 3000)
    }
  }

  const generateBackupCodes = async () => {
    setBusy(true)
    const res = await fetch('/api/super-admin/backup-codes', { method: 'POST' })
    if (res.ok) {
      const { codes } = await res.json()
      setBackupCodes(codes)
      setShowBackupCodes(false)
    }
    setBusy(false)
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-dash-accent" /></div>

  // Verified factor but not yet AAL2 this session → challenge to step up.
  if (factorId && !aal2) {
    return (
      <div className="max-w-sm mx-auto space-y-4 py-10">
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} className={useBackupCodes ? "text-dash-gold-dark" : "text-dash-success"} />
          <h1 className="dash-font-heading font-medium text-[22px] text-dash-ink">Vérification 2FA</h1>
        </div>
        <p className="text-dash-ink-soft text-sm">
          {useBackupCodes ? "Entrez un de vos codes de secours (8 caractères)." : "Entrez le code de votre application d’authentification."}
        </p>
        {error && <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-lg">{error}</div>}

        <input
          value={code}
          autoFocus
          onChange={e => setCode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (useBackupCodes ? verifyBackupCode() : verifyChallenge())}
          placeholder={useBackupCodes ? "a1b2c3d4" : "123456"}
          inputMode={useBackupCodes ? "text" : "numeric"}
          className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none text-center tracking-widest text-lg"
        />

        <button
          onClick={useBackupCodes ? verifyBackupCode : verifyChallenge}
          disabled={busy || (useBackupCodes ? code.length < 8 : code.length < 6)}
          className={`w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50 transition-all hover:opacity-90 ${useBackupCodes ? 'bg-dash-gold' : 'bg-dash-success'}`}
        >
          {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Vérifier'}
        </button>

        <button
          onClick={() => { setUseBackupCodes(!useBackupCodes); setError(''); setCode('') }}
          className="w-full text-center text-xs text-dash-ink-soft hover:text-dash-ink transition-colors pt-2"
        >
          {useBackupCodes ? "Utiliser l'application d'authentification" : "Utiliser un code de secours"}
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-md space-y-6">
      <div><h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Sécurité (2FA)</h1><p className="text-dash-ink-soft text-sm mt-1">Authentification à deux facteurs</p></div>
      {factorId ? (
        <div className="space-y-6">
          <div className="bg-dash-surface border border-dash-success/20 rounded-[20px] p-6 flex items-center gap-3">
            <ShieldCheck size={22} className="text-dash-success" />
            <div><p className="text-dash-ink font-semibold text-sm">2FA activée</p><p className="text-dash-ink-soft text-xs">Votre compte est protégé par une application d’authentification.</p></div>
          </div>

          <div className="bg-dash-surface border border-dash-border rounded-[20px] p-6 space-y-4">
            <h2 className="text-dash-ink font-semibold text-sm">Méthodes de récupération</h2>
            <p className="text-dash-ink-soft text-xs">Ajoutez un numéro de téléphone et un email pour récupérer votre compte si vous perdez l&apos;accès à votre application.</p>

            <div className="space-y-3">
              <div>
                <label className="text-dash-ink-soft text-xs font-medium mb-1.5 block">Numéro de téléphone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+213 55 55 55 55" className="w-full px-4 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none text-sm" />
              </div>
              <div>
                <label className="text-dash-ink-soft text-xs font-medium mb-1.5 block">Email de secours</label>
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="secours@gmail.com" type="email" className="w-full px-4 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none text-sm" />
              </div>
              <button onClick={saveRecoveryMethods} disabled={savingRecovery} className="w-full py-2.5 rounded-xl bg-dash-accent hover:bg-dash-accent-dark text-white font-semibold text-sm disabled:opacity-50 transition-all">
                {savingRecovery ? <Loader2 size={16} className="animate-spin mx-auto" /> : (recoverySaved ? 'Sauvegardé !' : 'Enregistrer')}
              </button>
            </div>
          </div>

          <div className="bg-dash-surface border border-dash-border rounded-[20px] p-6 space-y-4">
            <h2 className="text-dash-ink font-semibold text-sm">Codes de secours</h2>
            <p className="text-dash-ink-soft text-xs">Vous pouvez générer un nouveau jeu de 10 codes de secours. Attention : générer de nouveaux codes annulera les anciens.</p>

            {!backupCodes.length || showBackupCodes ? (
              <button onClick={generateBackupCodes} disabled={busy} className="w-full py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink hover:bg-dash-border font-semibold text-sm disabled:opacity-50 transition-colors">
                {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Générer de nouveaux codes'}
              </button>
            ) : (
              <div className="bg-dash-gold-soft border border-dash-gold/20 rounded-xl p-4 space-y-3 mt-4">
                <h3 className="text-dash-gold-dark font-bold text-sm flex items-center gap-2">
                  <ShieldAlert size={16} /> Nouveaux codes générés
                </h3>
                <p className="text-dash-gold-dark/80 text-xs">
                  Sauvegardez ces codes immédiatement. Ils ne s&apos;afficheront qu&apos;une seule fois.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map(c => (
                    <code key={c} className="bg-dash-surface px-2 py-1.5 rounded text-dash-gold-dark text-xs text-center font-mono border border-dash-gold/20">
                      {c}
                    </code>
                  ))}
                </div>
                <button onClick={() => { setShowBackupCodes(true); setBackupCodes([]) }} className="w-full py-2 rounded-lg bg-dash-gold/20 text-dash-gold-dark text-xs font-medium hover:bg-dash-gold/30">
                  J&apos;ai sauvegardé ces codes
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-dash-surface border border-dash-border rounded-[20px] p-6 space-y-4">
          {error && <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-lg">{error}</div>}
          {!qr ? (
            <>
              <div className="flex items-center gap-2"><Shield size={18} className="text-dash-gold-dark" /><p className="text-dash-ink font-semibold text-sm">Activez la 2FA pour continuer</p></div>
              <p className="text-dash-ink-soft text-xs">Requis pour accéder au panneau super admin.</p>
              <button onClick={startEnroll} disabled={busy} className="w-full py-3 rounded-xl bg-dash-accent hover:bg-dash-accent-dark text-white font-semibold text-sm disabled:opacity-50 transition-all">
                {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Commencer'}
              </button>
            </>
          ) : (
            <>
              {backupCodes.length > 0 && !showBackupCodes ? (
                <div className="space-y-4">
                  <div className="bg-dash-gold-soft border border-dash-gold/20 rounded-xl p-4 space-y-3">
                    <h3 className="text-dash-gold-dark font-bold text-sm flex items-center gap-2">
                      <ShieldAlert size={16} /> Sauvegardez ces codes de secours
                    </h3>
                    <p className="text-dash-gold-dark/80 text-xs">
                      Ces codes vous permettront de vous connecter si vous perdez accès à votre application d&apos;authentification.
                      <strong> Vous ne les verrez qu&apos;une seule fois.</strong>
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {backupCodes.map(c => (
                        <code key={c} className="bg-dash-surface px-2 py-1.5 rounded text-dash-gold-dark text-xs text-center font-mono border border-dash-gold/20">
                          {c}
                        </code>
                      ))}
                    </div>
                    <button onClick={() => setShowBackupCodes(true)} className="w-full py-2 rounded-lg bg-dash-gold/20 text-dash-gold-dark text-xs font-medium hover:bg-dash-gold/30">
                      J&apos;ai sauvegardé ces codes
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-dash-ink-soft text-xs">Scannez ce QR avec Google Authenticator / Authy, puis entrez le code :</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="QR 2FA" className="w-44 h-44 mx-auto rounded-xl bg-white p-2 border border-dash-border" />
                  <input value={code} onChange={e => setCode(e.target.value)} placeholder="123456" inputMode="numeric"
                    className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none text-center tracking-widest text-lg" />
                  <button onClick={verifyEnroll} disabled={busy || code.length < 6} className="w-full py-3 rounded-xl bg-dash-success text-white font-semibold text-sm disabled:opacity-50 transition-all hover:opacity-90">
                    {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Activer la 2FA'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
