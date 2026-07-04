'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Store, ChatbotTone, ChatbotSession, ChatMessage } from '@/types/database'
import { ULTIMATE_PLANS } from '@/types/database'
import {
  Loader2, Save, MessageCircle, Lock, Bot, ShoppingBag,
  ChevronDown, ChevronUp, Check, Power,
} from 'lucide-react'

const TONES: { id: ChatbotTone; label: string; desc: string }[] = [
  { id: 'chaleureux',    label: 'Chaleureux',    desc: 'Accueillant, comme un vendeur algérien' },
  { id: 'professionnel', label: 'Professionnel', desc: 'Précis et courtois' },
  { id: 'direct',        label: 'Direct',        desc: 'Efficace, va droit au but' },
  { id: 'amical',        label: 'Amical',        desc: 'Décontracté et proche du client' },
]

const DEFAULT_GREETING =
  'مرحبا! 👋 Bienvenue ! Je suis votre assistant. Je peux vous aider à choisir un produit, répondre à vos questions et prendre votre commande. Comment puis-je vous aider ?'

export default function ChatbotSettingsPage() {
  const router = useRouter()
  const [store, setStore] = useState<Store | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Config form
  const [enabled, setEnabled] = useState(true)
  const [greeting, setGreeting] = useState('')
  const [tone, setTone] = useState<ChatbotTone>('chaleureux')
  const [instructions, setInstructions] = useState('')

  // Conversations + usage
  const [sessions, setSessions] = useState<ChatbotSession[]>([])
  const [usageToday, setUsageToday] = useState(0)
  const [openSession, setOpenSession] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const { data } = await supabase.from('stores').select('*').eq('owner_id', user.id).single()
      if (!data) { router.push('/onboarding/step-1'); return }
      const s = data as Store
      setStore(s)
      const cb = s.settings?.chatbot
      setEnabled(cb?.enabled !== false)
      setGreeting(cb?.greeting ?? '')
      setTone(cb?.tone ?? 'chaleureux')
      setInstructions(cb?.instructions ?? '')
      setLoading(false)

      // Conversations + usage (only meaningful if chatbot is allowed)
      const allowed = ULTIMATE_PLANS.includes(s.plan) || s.chatbot_daily_limit > 0
      if (allowed) {
        try {
          const res = await fetch('/api/chatbot/sessions')
          if (res.ok) {
            const d = await res.json()
            setSessions(d.sessions ?? [])
            setUsageToday(d.usageToday ?? 0)
          }
        } catch { /* non-blocking */ }
      }
    })
  }, [router])

  const handleSave = async () => {
    if (!store) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('stores').update({
      settings: {
        ...store.settings,
        chatbot: { enabled, greeting: greeting.trim(), tone, instructions: instructions.trim() },
      },
    }).eq('id', store.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-gray-500" size={24} />
      </div>
    )
  }

  const chatbotAllowed = store && (ULTIMATE_PLANS.includes(store.plan) || store.chatbot_daily_limit > 0)

  // ---- LOCKED STATE (plan doesn't include chatbot) ----
  if (!chatbotAllowed) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-5">
          <Lock size={26} className="text-[#F59E0B]" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Chatbot IA — plan Ultimate</h2>
        <p className="text-gray-400 text-sm mb-6 leading-relaxed">
          Un assistant qui répond à vos clients en français et en darija 24h/24, et qui prend
          les commandes automatiquement. Disponible à partir du plan <span className="text-[#F59E0B] font-semibold">Ultimate</span>.
        </p>
        <button
          onClick={() => router.push('/dashboard/billing')}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-[#0A0A0F]"
          style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)' }}
        >
          Passer à Ultimate →
        </button>
      </div>
    )
  }

  const dailyLimit = store!.chatbot_daily_limit > 0 ? store!.chatbot_daily_limit : 150
  const usagePct = Math.min(100, Math.round((usageToday / dailyLimit) * 100))

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header + status */}
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(59,130,246,0.12)' }}>
          <Bot size={22} className="text-[#3B82F6]" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white">Chatbot IA</h2>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${enabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
              {enabled ? 'Actif' : 'Inactif'}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-0.5">Répond aux clients et prend les commandes automatiquement.</p>
        </div>
      </div>

      {/* Daily usage meter */}
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 uppercase tracking-wider">Messages aujourd&apos;hui</span>
          <span className="text-sm font-bold text-white">{usageToday} <span className="text-gray-500 font-normal">/ {dailyLimit}</span></span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all"
            style={{ width: `${usagePct}%`, background: usagePct > 85 ? '#EF4444' : usagePct > 60 ? '#F59E0B' : '#10B981' }} />
        </div>
      </div>

      {/* Enable / disable */}
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Power size={18} className={enabled ? 'text-green-400' : 'text-gray-500'} />
          <div>
            <p className="text-white font-medium text-sm">Activer le chatbot</p>
            <p className="text-gray-500 text-xs">Affiche l&apos;assistant sur votre boutique</p>
          </div>
        </div>
        <button
          onClick={() => setEnabled(e => !e)}
          className="relative w-12 h-6 rounded-full transition-colors flex-shrink-0"
          style={{ background: enabled ? '#22C55E' : 'rgba(255,255,255,0.15)' }}
          aria-label="Activer/désactiver"
        >
          <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: enabled ? '26px' : '2px' }} />
        </button>
      </div>

      {/* Config form */}
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-5">
        {/* Greeting */}
        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Message d&apos;accueil</label>
          <textarea
            value={greeting}
            onChange={e => setGreeting(e.target.value)}
            rows={3}
            placeholder={DEFAULT_GREETING}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all resize-none"
          />
          <p className="text-[11px] text-gray-600 mt-1">Laissez vide pour utiliser le message par défaut.</p>
        </div>

        {/* Tone */}
        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Personnalité</label>
          <div className="grid grid-cols-2 gap-2">
            {TONES.map(t => (
              <button
                key={t.id}
                onClick={() => setTone(t.id)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  tone === t.id ? 'border-[#3B82F6]/50 bg-[#3B82F6]/5' : 'border-white/10 hover:border-white/20'
                }`}
              >
                <p className={`text-sm font-medium ${tone === t.id ? 'text-[#3B82F6]' : 'text-white'}`}>{t.label}</p>
                <p className="text-gray-500 text-[11px] mt-0.5 leading-snug">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Extra instructions */}
        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">
            Instructions supplémentaires <span className="text-gray-600 normal-case">(optionnel)</span>
          </label>
          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            rows={3}
            placeholder="Ex: Propose la livraison gratuite dès 5000 DZD. Ne promets jamais de délai inférieur à 48h."
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all resize-none"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-60"
          style={{ background: saved ? '#22C55E' : 'linear-gradient(135deg, #3B82F6, #2563EB)' }}
        >
          {saving ? <><Loader2 size={16} className="animate-spin" /> Enregistrement…</>
            : saved ? <><Check size={16} /> Enregistré !</>
            : <><Save size={16} /> Enregistrer</>}
        </button>
      </div>

      {/* Recent conversations */}
      <div>
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <MessageCircle size={15} className="text-gray-400" /> Conversations récentes
        </h3>

        {sessions.length === 0 ? (
          <div className="bg-[#111118] border border-white/5 rounded-2xl p-8 text-center">
            <MessageCircle size={28} className="text-gray-700 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Aucune conversation pour le moment.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map(s => {
              const isOpen = openSession === s.id
              const msgs = (s.messages ?? []) as ChatMessage[]
              return (
                <div key={s.id} className="bg-[#111118] border border-white/5 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setOpenSession(isOpen ? null : s.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(59,130,246,0.12)' }}>
                      <Bot size={15} className="text-[#3B82F6]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{s.customer_phone || 'Client anonyme'}</p>
                      <p className="text-[11px] text-gray-500">{msgs.length} messages · {new Date(s.updated_at).toLocaleDateString('fr-DZ')}</p>
                    </div>
                    {s.order_id && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-green-400 bg-green-500/10 px-2 py-1 rounded-full flex-shrink-0">
                        <ShoppingBag size={10} /> Commande
                      </span>
                    )}
                    {isOpen ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 space-y-2 border-t border-white/5">
                      {msgs.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className="max-w-[80%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed"
                            style={{
                              background: m.role === 'user' ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)',
                              color: m.role === 'user' ? '#93C5FD' : '#E5E7EB',
                            }}
                          >
                            {m.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
