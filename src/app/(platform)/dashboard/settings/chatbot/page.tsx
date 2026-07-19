'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { Store, ChatbotTone, ChatbotSession, ChatMessage } from '@/types/database'
import { ULTIMATE_PLANS } from '@/types/database'
import {
  Loader2, Save, MessageCircle, Lock, Bot, ShoppingBag,
  ChevronDown, ChevronUp, Check, Power, Trash2
} from 'lucide-react'
import MessagingChannels from '@/components/dashboard/MessagingChannels'

const TONES: { id: ChatbotTone; label: string; desc: string }[] = [
  { id: 'chaleureux',    label: 'Chaleureux',    desc: 'Accueillant, comme un vendeur algérien' },
  { id: 'professionnel', label: 'Professionnel', desc: 'Précis et courtois' },
  { id: 'direct',        label: 'Direct',        desc: 'Efficace, va droit au but' },
  { id: 'amical',        label: 'Amical',        desc: 'Décontracté et proche du client' },
]

const DEFAULT_GREETING =
  'مرحبا! 👋 Bienvenue ! Je suis votre assistant. Je peux vous aider à choisir un produit, répondre à vos questions et prendre votre commande. Comment puis-je vous aider ?'

// Section reveal-on-appear animation (shared).
import { inViewReveal as reveal } from '@/lib/dashboard-motion'

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
  
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([])
  const [deletingSessions, setDeletingSessions] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const data = await resolveActiveStore(supabase, user.id) as Store | null
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

  const deleteSelectedSessions = async () => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer ${selectedSessionIds.length} conversation(s) ? Cette action est irréversible.`)) return
    setDeletingSessions(true)
    try {
      const res = await fetch('/api/chatbot/sessions/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedSessionIds })
      })
      if (!res.ok) throw new Error('Erreur de suppression')
      setSessions(prev => prev.filter(s => !selectedSessionIds.includes(s.id)))
      setSelectedSessionIds([])
    } catch (err) {
      alert('Erreur lors de la suppression')
    } finally {
      setDeletingSessions(false)
    }
  }

  const toggleAllSessions = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedSessionIds(sessions.map(s => s.id))
    else setSelectedSessionIds([])
  }

  const toggleOneSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setSelectedSessionIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-dash-accent" size={24} />
      </div>
    )
  }

  const chatbotAllowed = store && (ULTIMATE_PLANS.includes(store.plan) || store.chatbot_daily_limit > 0)

  // ---- LOCKED STATE (plan doesn't include chatbot) ----
  if (!chatbotAllowed) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-dash-gold-soft border border-dash-gold/20 flex items-center justify-center mb-5">
          <Lock size={26} className="text-dash-gold-dark" />
        </div>
        <h2 className="dash-font-heading font-medium text-[24px] text-dash-ink mb-2">Chatbot IA — plan Ultimate</h2>
        <p className="text-dash-ink-soft text-sm mb-6 leading-relaxed">
          Un assistant qui répond à vos clients en français et en darija 24h/24, et qui prend
          les commandes automatiquement. Disponible à partir du plan <span className="text-dash-gold-dark font-semibold">Ultimate</span>.
        </p>
        <button
          onClick={() => router.push('/dashboard/billing')}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white bg-dash-gold hover:bg-dash-gold-dark transition-all"
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
      <motion.div {...reveal} className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 bg-dash-accent-soft">
          <Bot size={22} className="text-dash-accent" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="dash-font-heading font-medium text-[24px] text-dash-ink">Chatbot IA</h1>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${enabled ? 'bg-dash-success-soft text-dash-success' : 'bg-dash-neutral-soft text-dash-neutral'}`}>
              {enabled ? 'Actif' : 'Inactif'}
            </span>
          </div>
          <p className="text-dash-ink-soft text-sm mt-0.5">Répond aux clients et prend les commandes automatiquement.</p>
        </div>
      </motion.div>

      {/* Daily usage meter */}
      <motion.div {...reveal} className="bg-dash-surface border border-dash-border rounded-[20px] p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-dash-ink-soft uppercase tracking-wider">Messages aujourd&apos;hui</span>
          <span className="text-sm font-bold text-dash-ink">{usageToday} <span className="text-dash-ink-soft font-normal">/ {dailyLimit}</span></span>
        </div>
        <div className="h-1.5 bg-dash-surface-2 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all"
            style={{ width: `${usagePct}%`, background: usagePct > 85 ? 'var(--color-dash-danger)' : usagePct > 60 ? 'var(--color-dash-gold)' : 'var(--color-dash-success)' }} />
        </div>
      </motion.div>

      {/* Enable / disable */}
      <motion.div {...reveal} className="bg-dash-surface border border-dash-border rounded-[20px] p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Power size={18} className={enabled ? 'text-dash-success' : 'text-dash-ink-soft'} />
          <div>
            <p className="text-dash-ink font-medium text-sm">Activer le chatbot</p>
            <p className="text-dash-ink-soft text-xs">Affiche l&apos;assistant sur votre boutique</p>
          </div>
        </div>
        <button
          onClick={() => setEnabled(e => !e)}
          className="relative w-12 h-6 rounded-full transition-colors flex-shrink-0"
          style={{ background: enabled ? 'var(--color-dash-success)' : 'rgba(0,0,0,0.15)' }}
          aria-label="Activer/désactiver"
        >
          <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all" style={{ left: enabled ? '26px' : '2px' }} />
        </button>
      </motion.div>

      {/* Config form */}
      <motion.div {...reveal} className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-5">
        {/* Greeting */}
        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Message d&apos;accueil</label>
          <textarea
            value={greeting}
            onChange={e => setGreeting(e.target.value)}
            rows={3}
            placeholder={DEFAULT_GREETING}
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink text-sm placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all resize-none"
          />
          <p className="text-[11px] text-dash-ink-faint mt-1">Laissez vide pour utiliser le message par défaut.</p>
        </div>

        {/* Tone */}
        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Personnalité</label>
          <div className="grid grid-cols-2 gap-2">
            {TONES.map(t => (
              <button
                key={t.id}
                onClick={() => setTone(t.id)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  tone === t.id ? 'border-dash-accent/50 bg-dash-accent-soft' : 'border-dash-border hover:border-dash-ink-faint/40'
                }`}
              >
                <p className={`text-sm font-medium ${tone === t.id ? 'text-dash-accent' : 'text-dash-ink'}`}>{t.label}</p>
                <p className="text-dash-ink-soft text-[11px] mt-0.5 leading-snug">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Extra instructions */}
        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">
            Instructions supplémentaires <span className="text-dash-ink-faint normal-case">(optionnel)</span>
          </label>
          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            rows={3}
            placeholder="Ex: Propose la livraison gratuite dès 5000 DZD. Ne promets jamais de délai inférieur à 48h."
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink text-sm placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all resize-none"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-60 ${saved ? 'bg-dash-success' : 'bg-dash-accent hover:bg-dash-accent-dark'}`}
        >
          {saving ? <><Loader2 size={16} className="animate-spin" /> Enregistrement…</>
            : saved ? <><Check size={16} /> Enregistré !</>
            : <><Save size={16} /> Enregistrer</>}
        </button>
      </motion.div>

      {/* Messaging channels (Messenger + Instagram) */}
      <motion.div {...reveal}><MessagingChannels locked={false} /></motion.div>

      {/* Recent conversations */}
      <motion.div {...reveal}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-dash-ink flex items-center gap-2">
            <MessageCircle size={15} className="text-dash-ink-soft" /> Conversations récentes
          </h3>
          {sessions.length > 0 && (
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-dash-ink-soft hover:text-dash-ink transition-colors">
                <input
                  type="checkbox"
                  checked={sessions.length > 0 && selectedSessionIds.length === sessions.length}
                  onChange={toggleAllSessions}
                  className="w-4 h-4 rounded border-dash-border bg-dash-surface-2 accent-dash-accent focus:ring-0 focus:ring-offset-0"
                />
                Tout sélectionner
              </label>
              {selectedSessionIds.length > 0 && (
                <button
                  onClick={deleteSelectedSessions}
                  disabled={deletingSessions}
                  className="flex items-center gap-1.5 bg-dash-danger-soft hover:bg-dash-danger/15 text-dash-danger px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 text-xs"
                >
                  {deletingSessions ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  Supprimer ({selectedSessionIds.length})
                </button>
              )}
            </div>
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="bg-dash-surface border border-dash-border rounded-[20px] p-8 text-center">
            <MessageCircle size={28} className="text-dash-ink-faint mx-auto mb-2" />
            <p className="text-dash-ink-soft text-sm">Aucune conversation pour le moment.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map(s => {
              const isOpen = openSession === s.id
              const msgs = (s.messages ?? []) as ChatMessage[]
              return (
                <div key={s.id} className="bg-dash-surface border border-dash-border rounded-[20px] overflow-hidden">
                  <div className="flex items-center w-full hover:bg-dash-surface-2 transition-colors">
                    <div className="pl-4 py-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedSessionIds.includes(s.id)}
                        onChange={e => toggleOneSession(e as unknown as React.MouseEvent, s.id)}
                        className="w-4 h-4 rounded border-dash-border bg-dash-surface-2 accent-dash-accent focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                    </div>
                    <button
                      onClick={() => setOpenSession(isOpen ? null : s.id)}
                      className="flex-1 flex items-center gap-3 pr-4 py-3 text-left"
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-dash-accent-soft">
                        <Bot size={15} className="text-dash-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-dash-ink truncate">{s.customer_phone || 'Client anonyme'}</p>
                        <p className="text-[11px] text-dash-ink-soft">{msgs.length} messages · {new Date(s.updated_at).toLocaleDateString('fr-DZ')}</p>
                      </div>
                      {s.order_id && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-dash-success bg-dash-success-soft px-2 py-1 rounded-full flex-shrink-0">
                          <ShoppingBag size={10} /> Commande
                        </span>
                      )}
                      {isOpen ? <ChevronUp size={16} className="text-dash-ink-soft" /> : <ChevronDown size={16} className="text-dash-ink-soft" />}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 space-y-2 border-t border-dash-border">
                      {msgs.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed ${m.role === 'user' ? 'bg-dash-accent-soft text-dash-accent' : 'bg-dash-surface-2 text-dash-ink'}`}>
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
      </motion.div>
    </div>
  )
}
