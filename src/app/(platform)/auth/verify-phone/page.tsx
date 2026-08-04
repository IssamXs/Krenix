'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Loader2, ShieldCheck, Send } from 'lucide-react'
import KrenixLogo from '@/components/ui/KrenixLogo'
import BackToHomeLink from '@/components/auth/BackToHomeLink'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import LanguageSwitcher from '@/components/dashboard/ui/LanguageSwitcher'
import { isValidAlgerianPhone } from '@/lib/phone'

const EASE = [0.16, 1, 0.3, 1] as const
const RESEND_COOLDOWN = 60

type Phase = 'enter-phone' | 'code' | 'no-telegram'

// '+213555123456' -> '0555 •• •• 56'
function maskPhone(e164: string): string {
  const local = '0' + e164.slice(4)
  return `${local.slice(0, 4)} •• •• ${local.slice(-2)}`
}

export default function VerifyPhonePage() {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [phase, setPhase] = useState<Phase>('enter-phone')
  const [phoneInput, setPhoneInput] = useState('')
  const [maskedPhone, setMaskedPhone] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  async function sendCode(phone?: string) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/verify-phone/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(phone ? { phone } : {}),
      })
      if (res.status === 401) {
        router.push('/auth/login')
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('auth.verifyPhone.sendError'))
        setLoading(false)
        return
      }
      setMaskedPhone(maskPhone(data.phone))
      setCooldown(RESEND_COOLDOWN)
      setPhase(data.deliverable ? 'code' : 'no-telegram')
    } catch {
      setError(t('auth.verifyPhone.sendError'))
    }
    setLoading(false)
  }

  useEffect(() => {
    const phoneParam = searchParams.get('phone')
    if (phoneParam) sendCode(phoneParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  function submitPhone() {
    if (!isValidAlgerianPhone(phoneInput)) {
      setError(t('auth.register.phoneInvalid'))
      return
    }
    sendCode(phoneInput.trim())
  }

  async function submitCode() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/verify-phone/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (res.status === 401) {
        router.push('/auth/login')
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('auth.verifyPhone.wrongCode'))
        setLoading(false)
        return
      }
      // status is one of: 'code_valid' | 'code_invalid' | 'expired' | 'error'.
      // 'error' means the check itself couldn't be performed (misconfigured
      // token, network/gateway failure) — NOT that the code was wrong — so it
      // must not be shown as "wrong code". Map it to the generic send-failure
      // message instead.
      if (data.status === 'code_valid') {
        router.push('/onboarding/step-1')
        return
      }
      if (data.status === 'expired') {
        setError(t('auth.verifyPhone.codeExpired'))
      } else if (data.status === 'error') {
        setError(t('auth.verifyPhone.sendError'))
      } else {
        setError(t('auth.verifyPhone.wrongCode'))
      }
    } catch {
      setError(t('auth.verifyPhone.wrongCode'))
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-dash-page flex items-center justify-center p-4 relative overflow-hidden dash-font-sans">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[620px] h-[420px] rounded-full blur-[130px]" style={{ background: 'var(--color-dash-accent-soft)' }} />
      </div>
      <BackToHomeLink label={t('common.backToHome')} />
      <div className="absolute top-4 end-4 z-10">
        <LanguageSwitcher />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-4">
            <KrenixLogo height={68} compact />
            <span className="font-heading text-[30px] font-extrabold text-dash-ink tracking-tight">Krenix</span>
          </div>
        </div>

        <div className="bg-dash-surface border border-dash-border rounded-[24px] p-8 shadow-[0_24px_60px_-24px_rgba(20,26,33,0.18)]">
          {error && (
            <div className="mb-5 bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {phase === 'enter-phone' && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <ShieldCheck size={28} className="text-dash-accent mx-auto mb-3" />
                <h1 className="dash-font-heading text-[22px] font-medium text-dash-ink">{t('auth.verifyPhone.enterPhoneTitle')}</h1>
                <p className="text-dash-ink-soft text-sm mt-1">{t('auth.verifyPhone.enterPhoneSubtitle')}</p>
              </div>
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitPhone()}
                placeholder={t('auth.verifyPhone.phonePlaceholder')}
                className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-center"
              />
              <motion.button
                whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }}
                onClick={submitPhone}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm text-white bg-dash-accent hover:bg-dash-accent-dark transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <>{t('auth.verifyPhone.verifyButton')} <Send size={16} /></>}
              </motion.button>
            </div>
          )}

          {phase === 'code' && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <ShieldCheck size={28} className="text-dash-accent mx-auto mb-3" />
                <h1 className="dash-font-heading text-[22px] font-medium text-dash-ink">{t('auth.verifyPhone.title')}</h1>
                <p className="text-dash-ink-soft text-sm mt-1">
                  {t('auth.verifyPhone.subtitleWithPhone')} <span className="font-semibold text-dash-ink">{maskedPhone}</span>
                </p>
              </div>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && submitCode()}
                placeholder={t('auth.verifyPhone.codePlaceholder')}
                className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-center text-lg tracking-[0.3em]"
              />
              <motion.button
                whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }}
                onClick={submitCode}
                disabled={loading || code.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm text-white bg-dash-accent hover:bg-dash-accent-dark transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : t('auth.verifyPhone.verifyButton')}
              </motion.button>
              <div className="flex items-center justify-between text-sm pt-2">
                <button
                  type="button"
                  onClick={() => { setPhase('enter-phone'); setPhoneInput(''); setCode(''); setError('') }}
                  className="text-dash-ink-faint hover:text-dash-ink transition-colors"
                >
                  {t('auth.verifyPhone.editNumber')}
                </button>
                <button
                  type="button"
                  onClick={() => sendCode()}
                  disabled={cooldown > 0 || loading}
                  className="text-dash-accent hover:text-dash-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {cooldown > 0 ? t('auth.verifyPhone.resendCountdown', { seconds: cooldown }) : t('auth.verifyPhone.resendButton')}
                </button>
              </div>
            </div>
          )}

          {phase === 'no-telegram' && (
            <div className="text-center space-y-4">
              <ShieldCheck size={28} className="text-dash-accent mx-auto" />
              <h1 className="dash-font-heading text-[22px] font-medium text-dash-ink">{t('auth.verifyPhone.noTelegramTitle')}</h1>
              <p className="text-dash-ink-soft text-sm leading-relaxed">{t('auth.verifyPhone.noTelegramBody')}</p>
              <div className="space-y-2 pt-2">
                <a
                  href="https://telegram.org/dl"
                  target="_blank" rel="noopener noreferrer"
                  className="block w-full py-3.5 rounded-xl font-semibold text-sm text-white bg-dash-accent hover:bg-dash-accent-dark transition-colors"
                >
                  {t('auth.verifyPhone.installTelegram')}
                </a>
                <button
                  type="button"
                  onClick={() => { setPhase('enter-phone'); setError('') }}
                  className="block w-full py-3.5 rounded-xl font-semibold text-sm text-dash-ink border border-dash-border hover:bg-dash-surface-2 transition-all"
                >
                  {t('auth.verifyPhone.retryAfterInstall')}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
