'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, Store, ExternalLink, Loader2, Sparkles } from 'lucide-react'
import { PLAN_LABELS, ASSIGNABLE_PLANS, type Plan } from '@/types/database'
import { useProtectedAction } from '@/components/super-admin/StepUpModal'

interface StoreRow {
  id: string
  name: string
  slug: string
  plan: Plan
  subscription_status: string
  ai_credits: number
  chatbot_daily_limit: number
  is_suspended: boolean
  is_onboarded: boolean
  created_at: string
  owner_id: string
  custom_domain: string | null
  purchased_credits: number
  purchased_chatbot: number
  subscriptions?: { status: string; expires_at: string | null }[]
}

const PLAN_COLORS: Record<string, string> = {
  basic: 'text-dash-ink-soft bg-dash-surface-2',
  pro: 'text-dash-info bg-dash-info-soft',
  ultimate: 'text-dash-gold-dark bg-dash-gold-soft',
  growth: 'text-dash-success bg-dash-success-soft',
  business: 'text-dash-purple bg-dash-purple-soft',
  agency: 'text-dash-danger bg-dash-danger-soft',
  enterprise: 'text-dash-info bg-dash-info-soft',
  sur_mesure: 'text-dash-purple bg-dash-purple-soft',
}

const DAY_MS = 24 * 60 * 60 * 1000

// What covers this store right now, and until when. A store can hold several
// active subscriptions (e.g. one-time Basic + monthly Ultimate), so the one that
// matters is whichever runs LONGEST — that's the real end of access.
function describeCover(store: StoreRow): {
  label: string
  detail: string
  tone: string
} {
  const active = (store.subscriptions ?? []).filter(s => s.status === 'active')
  if (active.length === 0) {
    return { label: 'Non actif', detail: 'Aucun abonnement actif', tone: 'text-dash-ink-soft' }
  }

  // A null expires_at means a one-time plan that never lapses.
  if (active.some(s => !s.expires_at)) {
    return { label: 'Permanent', detail: 'Paiement unique — sans expiration', tone: 'text-dash-ink-soft' }
  }

  const latest = active.reduce((a, b) =>
    new Date(a.expires_at!).getTime() >= new Date(b.expires_at!).getTime() ? a : b)
  const ts = new Date(latest.expires_at!).getTime()
  const days = Math.ceil((ts - Date.now()) / DAY_MS)
  const date = new Date(ts).toLocaleDateString('fr-DZ')

  if (days < 0) return { label: `Expiré le ${date}`, detail: `Expiré depuis ${Math.abs(days)} j`, tone: 'text-dash-danger' }
  if (days === 0) return { label: `Expire aujourd'hui`, detail: date, tone: 'text-dash-danger' }
  if (days <= 7) return { label: `Expire le ${date}`, detail: `Dans ${days} j`, tone: 'text-dash-warning-dark' }
  return { label: `Expire le ${date}`, detail: `Dans ${days} j`, tone: 'text-dash-ink-soft' }
}

export default function SuperAdminStores() {
  const [stores, setStores] = useState<StoreRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editingStore, setEditingStore] = useState<StoreRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({ plan: '', ai_credits: '', chatbot_daily_limit: '' })
  // Read ?highlight= once at mount — the notifications panel links here to point
  // at a specific store, and that row should start expanded.
  const [highlightId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('highlight'))
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(highlightId)
  const { run, modal } = useProtectedAction()

  useEffect(() => {
    const supabase = createClient()
    supabase.from('stores').select('*, subscriptions(status, expires_at)').order('created_at', { ascending: false }).then(({ data }) => {
      setStores((data ?? []) as StoreRow[])
      setLoading(false)
    })
  }, [])

  // Scroll the ?highlight= store into view once the list has rendered. The
  // expanded row itself comes from state initialised at mount (see useState
  // above) rather than being set here — setState in an effect body cascades.
  useEffect(() => {
    if (!highlightId || stores.length === 0) return
    const t = setTimeout(() => {
      document.getElementById(`store-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    return () => clearTimeout(t)
  }, [highlightId, stores.length])

  const openEdit = (store: StoreRow) => {
    setEditingStore(store)
    setEditForm({
      plan: store.plan,
      ai_credits: String(store.ai_credits),
      chatbot_daily_limit: String(store.chatbot_daily_limit),
    })
  }

  const handleSave = async () => {
    if (!editingStore) return
    setSaving(true)
    const res = await run(() => fetch(`/api/super-admin/stores/${editingStore.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: editForm.plan, ai_credits: Number(editForm.ai_credits), chatbot_daily_limit: Number(editForm.chatbot_daily_limit) }),
    }))
    if (res && res.ok) {
      setStores(prev => prev.map(s => s.id === editingStore.id
        ? { ...s, plan: editForm.plan as Plan, ai_credits: Number(editForm.ai_credits), chatbot_daily_limit: Number(editForm.chatbot_daily_limit) } : s))
      setEditingStore(null)
    }
    setSaving(false)
  }

  const toggleSuspend = async (store: StoreRow) => {
    const res = await run(() => fetch(`/api/super-admin/stores/${store.id}/suspend`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ suspend: !store.is_suspended }),
    }))
    if (res && res.ok) setStores(prev => prev.map(s => s.id === store.id ? { ...s, is_suspended: !s.is_suspended } : s))
  }

  const filtered = stores.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.slug.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Boutiques</h1>
        <p className="text-dash-ink-soft text-sm mt-1">{stores.length} boutique{stores.length !== 1 ? 's' : ''} au total</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-dash-ink-faint" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou slug…"
          className="w-full pl-11 pr-4 py-3 rounded-xl bg-dash-surface border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-dash-accent" /></div>
      ) : (
        <div className="bg-dash-surface border border-dash-border rounded-[20px] overflow-hidden">
          <div className="divide-y divide-dash-border">
            {filtered.map(store => {
              const isExpanded = expandedStoreId === store.id
              const cover = describeCover(store)
              const createdDate = new Date(store.created_at).toLocaleDateString('fr-DZ')

              return (
              <div key={store.id} id={`store-${store.id}`} className="flex flex-col">
                <div
                  onClick={() => setExpandedStoreId(isExpanded ? null : store.id)}
                  className={`px-4 sm:px-6 py-4 flex items-center gap-3 sm:gap-4 hover:bg-dash-surface-2 transition-all cursor-pointer ${store.is_suspended ? 'opacity-50' : ''} ${isExpanded ? 'bg-dash-surface-2' : ''}`}>
                  <div className="w-9 h-9 rounded-xl bg-dash-surface-2 flex items-center justify-center flex-shrink-0">
                    <Store size={16} className="text-dash-ink-soft" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-dash-ink text-sm font-medium truncate">{store.name}</p>
                      {store.is_suspended && <span className="text-dash-danger text-xs bg-dash-danger-soft px-2 py-0.5 rounded-full">Suspendu</span>}
                      {!store.is_onboarded && <span className="text-dash-warning-dark text-xs bg-dash-warning-soft px-2 py-0.5 rounded-full">Onboarding</span>}
                      {!ASSIGNABLE_PLANS.includes(store.plan) && (
                        <span className="text-dash-purple text-xs bg-dash-purple-soft px-2 py-0.5 rounded-full" title="Plan obsolète — réassignez un vrai palier">
                          À réassigner
                        </span>
                      )}
                    </div>
                    <p className="text-dash-ink-soft text-xs truncate">{store.slug}.krenix.store</p>
                  </div>

                  <div className="hidden md:block text-right">
                     <p className="text-dash-ink-soft text-xs">Créé le {createdDate}</p>
                     <p className={`text-xs ${cover.tone}`}>{cover.label}</p>
                  </div>

                  <div className="flex items-center gap-3 w-auto sm:w-32 justify-end">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_COLORS[store.plan]}`}>
                      {PLAN_LABELS[store.plan]}
                    </span>
                    <div className="hidden sm:flex items-center gap-1 text-dash-ink-soft text-xs">
                      <Sparkles size={11} className="text-dash-accent" />
                      {store.ai_credits}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 sm:px-6 py-4 bg-dash-surface-2 border-t border-dash-border grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-dash-ink-soft text-xs mb-1">Informations</p>
                      <p className="text-dash-ink">Créé le : <span className="text-dash-ink-soft">{createdDate}</span></p>
                      <p className="text-dash-ink">Statut : <span className="text-dash-ink-soft">{store.subscription_status}</span></p>
                      <p className="text-dash-ink">Domaine : <span className="text-dash-ink-soft">{store.custom_domain || '—'}</span></p>
                    </div>
                    <div>
                      <p className="text-dash-ink-soft text-xs mb-1">Plan & Expiration</p>
                      <p className="text-dash-ink">Plan : <span className={PLAN_COLORS[store.plan] + ' px-1.5 py-0.5 rounded text-xs'}>{PLAN_LABELS[store.plan]}</span></p>
                      <p className="text-dash-ink">Expiration : <span className={cover.tone}>{cover.label}</span></p>
                      <p className="text-dash-ink-soft text-xs mt-0.5">{cover.detail}</p>
                    </div>
                    <div>
                      <p className="text-dash-ink-soft text-xs mb-1">Limites & Crédits</p>
                      <p className="text-dash-ink">Crédits IA : <span className="text-dash-ink-soft">{store.ai_credits}</span></p>
                      <p className="text-dash-ink">Chatbot/jour : <span className="text-dash-ink-soft">{store.chatbot_daily_limit}</span></p>
                      <p className="text-dash-ink">Achetés : <span className="text-dash-ink-soft">{store.purchased_credits} IA / {store.purchased_chatbot} msg</span></p>
                    </div>
                    <div className="flex flex-col items-end gap-2 justify-center">
                      <button onClick={(e) => { e.stopPropagation(); openEdit(store); }} className="w-full max-w-[140px] px-3 py-1.5 rounded-lg border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint/40 transition-all text-xs text-center">
                        Modifier plan/limites
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); toggleSuspend(store); }} className={`w-full max-w-[140px] px-3 py-1.5 rounded-lg border transition-all text-xs text-center ${store.is_suspended ? 'border-dash-success/20 text-dash-success hover:bg-dash-success-soft' : 'border-dash-danger/20 text-dash-danger hover:bg-dash-danger-soft'}`}>
                        {store.is_suspended ? 'Réactiver boutique' : 'Suspendre boutique'}
                      </button>
                      <a href={`/?store=${store.slug}`} target="_blank" rel="noopener noreferrer" className="w-full max-w-[140px] px-3 py-1.5 rounded-lg border border-dash-accent/30 text-dash-accent hover:bg-dash-accent-soft transition-all text-xs text-center flex justify-center items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        Voir la boutique <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                )}
              </div>
              )
            })}
            {!filtered.length && (
              <div className="px-6 py-12 text-center text-dash-ink-soft text-sm">Aucune boutique trouvée.</div>
            )}
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-dash-surface border border-dash-border rounded-[20px] p-6 w-full max-w-sm space-y-4">
            <h3 className="text-dash-ink font-bold">Modifier — {editingStore.name}</h3>

            <div>
              <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Plan</label>
              <select
                value={editForm.plan}
                onChange={e => setEditForm(f => ({ ...f, plan: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink outline-none focus:border-dash-accent/50 transition-all text-sm"
              >
                {ASSIGNABLE_PLANS.map(value => (
                  <option key={value} value={value}>{PLAN_LABELS[value]}</option>
                ))}
                {/* Keep the current value selectable if it's a legacy plan, so
                    opening the modal can't silently reassign the store. */}
                {!ASSIGNABLE_PLANS.includes(editingStore.plan) && (
                  <option value={editingStore.plan}>{PLAN_LABELS[editingStore.plan]}</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Crédits IA</label>
              <input
                type="number"
                value={editForm.ai_credits}
                onChange={e => setEditForm(f => ({ ...f, ai_credits: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink outline-none focus:border-dash-accent/50 transition-all text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Limite chatbot/jour (0 = désactivé)</label>
              <input
                type="number"
                value={editForm.chatbot_daily_limit}
                onChange={e => setEditForm(f => ({ ...f, chatbot_daily_limit: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink outline-none focus:border-dash-accent/50 transition-all text-sm"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setEditingStore(null)}
                className="flex-1 py-3 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink transition-all text-sm"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-dash-accent hover:bg-dash-accent-dark text-white font-semibold text-sm transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal}
    </div>
  )
}
