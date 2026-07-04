'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, Store, ExternalLink, Ban, CheckCircle, Loader2, Sparkles } from 'lucide-react'
import { PLAN_LABELS, type Plan } from '@/types/database'

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
}

const PLAN_COLORS: Record<string, string> = {
  basic: 'text-gray-400 bg-gray-400/10',
  pro: 'text-blue-400 bg-blue-400/10',
  ultimate: 'text-amber-400 bg-amber-400/10',
  sur_mesure: 'text-purple-400 bg-purple-400/10',
}

export default function SuperAdminStores() {
  const [stores, setStores] = useState<StoreRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editingStore, setEditingStore] = useState<StoreRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({ plan: '', ai_credits: '', chatbot_daily_limit: '' })

  useEffect(() => {
    const supabase = createClient()
    supabase.from('stores').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      setStores((data ?? []) as StoreRow[])
      setLoading(false)
    })
  }, [])

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
    const supabase = createClient()
    const { error } = await supabase.from('stores').update({
      plan: editForm.plan,
      ai_credits: Number(editForm.ai_credits),
      chatbot_daily_limit: Number(editForm.chatbot_daily_limit),
    }).eq('id', editingStore.id)

    if (!error) {
      setStores(prev => prev.map(s => s.id === editingStore.id
        ? { ...s, plan: editForm.plan as Plan, ai_credits: Number(editForm.ai_credits), chatbot_daily_limit: Number(editForm.chatbot_daily_limit) }
        : s
      ))
      setEditingStore(null)
    }
    setSaving(false)
  }

  const toggleSuspend = async (store: StoreRow) => {
    const supabase = createClient()
    await supabase.from('stores').update({ is_suspended: !store.is_suspended }).eq('id', store.id)
    setStores(prev => prev.map(s => s.id === store.id ? { ...s, is_suspended: !s.is_suspended } : s))
  }

  const filtered = stores.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.slug.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Boutiques</h1>
        <p className="text-gray-500 text-sm mt-1">{stores.length} boutique{stores.length !== 1 ? 's' : ''} au total</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou slug…"
          className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#111118] border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all text-sm"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-gray-500" /></div>
      ) : (
        <div className="bg-[#111118] border border-white/5 rounded-2xl overflow-hidden">
          <div className="divide-y divide-white/5">
            {filtered.map(store => (
              <div key={store.id} className={`px-6 py-4 flex items-center gap-4 hover:bg-white/2 transition-all ${store.is_suspended ? 'opacity-50' : ''}`}>
                <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                  <Store size={16} className="text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white text-sm font-medium truncate">{store.name}</p>
                    {store.is_suspended && <span className="text-red-400 text-xs bg-red-400/10 px-2 py-0.5 rounded-full">Suspendu</span>}
                    {!store.is_onboarded && <span className="text-yellow-400 text-xs bg-yellow-400/10 px-2 py-0.5 rounded-full">Onboarding</span>}
                  </div>
                  <p className="text-gray-500 text-xs truncate">{store.slug}.novalux.com</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_COLORS[store.plan]}`}>
                    {PLAN_LABELS[store.plan]}
                  </span>
                  <div className="flex items-center gap-1 text-gray-500 text-xs">
                    <Sparkles size={11} className="text-[#3B82F6]" />
                    {store.ai_credits}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(store)}
                    className="px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all text-xs"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => toggleSuspend(store)}
                    className={`p-1.5 rounded-lg transition-all ${store.is_suspended ? 'text-green-400 hover:bg-green-400/10' : 'text-red-400 hover:bg-red-400/10'}`}
                    title={store.is_suspended ? 'Réactiver' : 'Suspendre'}
                  >
                    {store.is_suspended ? <CheckCircle size={15} /> : <Ban size={15} />}
                  </button>
                  <a
                    href={`/?store=${store.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all"
                    title="Voir la boutique"
                  >
                    <ExternalLink size={15} />
                  </a>
                </div>
              </div>
            ))}
            {!filtered.length && (
              <div className="px-6 py-12 text-center text-gray-500 text-sm">Aucune boutique trouvée.</div>
            )}
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#111118] border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-white font-bold">Modifier — {editingStore.name}</h3>

            <div>
              <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Plan</label>
              <select
                value={editForm.plan}
                onChange={e => setEditForm(f => ({ ...f, plan: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-[#3B82F6]/50 transition-all text-sm"
              >
                {Object.entries(PLAN_LABELS).map(([value, label]) => (
                  <option key={value} value={value} className="bg-[#111118]">{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Crédits IA</label>
              <input
                type="number"
                value={editForm.ai_credits}
                onChange={e => setEditForm(f => ({ ...f, ai_credits: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-[#3B82F6]/50 transition-all text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Limite chatbot/jour (0 = désactivé)</label>
              <input
                type="number"
                value={editForm.chatbot_daily_limit}
                onChange={e => setEditForm(f => ({ ...f, chatbot_daily_limit: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-[#3B82F6]/50 transition-all text-sm"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setEditingStore(null)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white transition-all text-sm"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-black font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
