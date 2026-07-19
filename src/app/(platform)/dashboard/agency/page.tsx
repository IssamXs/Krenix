'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { setActiveStoreId, getActiveStoreId } from '@/lib/active-store'
import { AGENCY_PLANS, PLAN_STORE_LIMITS, PLAN_LABELS, type Plan } from '@/types/database'
import { Store as StoreIcon, Loader2, Plus, ArrowRight, Check, Trash2 } from 'lucide-react'
import LockedFeatureCard from '@/components/dashboard/ui/LockedFeatureCard'

interface StoreRow {
  id: string
  name: string
  slug: string
  plan: Plan
  orders: number
  revenue: number
}

import { formatDA as DA } from '@/lib/format'

export default function AgencyPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [ownerPlan, setOwnerPlan] = useState<Plan | null>(null)
  const [stores, setStores] = useState<StoreRow[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const { data: owned } = await supabase.from('stores').select('id, name, slug, plan').eq('owner_id', user.id).order('created_at')
      const list = owned ?? []
      // Agency access is determined by the highest plan among the owner's stores.
      const topPlan = list.map(s => s.plan as Plan).find(p => AGENCY_PLANS.includes(p)) ?? (list[0]?.plan as Plan ?? null)
      setOwnerPlan(topPlan)
      const ok = list.some(s => AGENCY_PLANS.includes(s.plan as Plan))
      setAllowed(ok)
      if (!ok) { setLoading(false); return }

      // Per-store stats
      const withStats: StoreRow[] = await Promise.all(list.map(async s => {
        const { data: orders } = await supabase.from('orders').select('total_price, status').eq('store_id', s.id)
        const revenue = (orders ?? []).filter(o => o.status === 'livree').reduce((a, o) => a + Number(o.total_price ?? 0), 0)
        return { id: s.id, name: s.name, slug: s.slug, plan: s.plan as Plan, orders: (orders ?? []).length, revenue }
      }))
      setStores(withStats)
      setActiveId(getActiveStoreId() ?? withStats[0]?.id ?? null)
      setLoading(false)
    })
  }, [router])

  const [deleting, setDeleting] = useState<string | null>(null)

  const manage = (id: string) => {
    setActiveStoreId(id)
    setActiveId(id)
    router.push('/dashboard')
  }

  const deleteStore = async (id: string, name: string) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer définitivement la boutique "${name}" ? Cette action est irréversible.`)) {
      return
    }
    setDeleting(id)
    try {
      const res = await fetch(`/api/stores/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur de suppression')
      setStores(s => s.filter(x => x.id !== id))
      if (activeId === id) {
        const next = stores.find(x => x.id !== id)?.id ?? null
        if (next) setActiveStoreId(next)
        setActiveId(next)
      }
    } catch (err) {
      alert('Erreur lors de la suppression de la boutique.')
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-dash-accent" size={26} /></div>
  }

  if (!allowed) {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Agence</h1>
          <p className="text-dash-ink-soft text-sm mt-1">Gérez plusieurs boutiques depuis un seul compte</p>
        </div>
        <LockedFeatureCard title="Vue multi-boutiques" requiredPlan="Agency" />
      </div>
    )
  }

  const limit = ownerPlan ? PLAN_STORE_LIMITS[ownerPlan] : 1
  const canCreate = stores.length < limit

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Agence</h1>
          <p className="text-dash-ink-soft text-sm mt-1">
            {stores.length} boutique{stores.length !== 1 ? 's' : ''} · {Number.isFinite(limit) ? `${limit} max` : 'illimité'}
          </p>
        </div>
        {canCreate ? (
          <button onClick={() => router.push('/onboarding/step-1?new=1')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dash-accent hover:bg-dash-accent-dark text-white font-semibold text-sm transition-all">
            <Plus size={16} /> Nouvelle boutique
          </button>
        ) : (
          <span className="text-xs text-dash-ink-soft">Limite de boutiques atteinte</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {stores.map(s => (
          <div key={s.id} className={`bg-dash-surface border rounded-[20px] p-5 ${s.id === activeId ? 'border-dash-accent/40' : 'border-dash-border'}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-dash-accent-soft">
                <StoreIcon size={18} className="text-dash-accent" />
              </div>
              <div className="min-w-0">
                <p className="text-dash-ink font-semibold text-sm truncate">{s.name}</p>
                <p className="text-dash-ink-soft text-xs">{PLAN_LABELS[s.plan]}</p>
              </div>
              {s.id === activeId && (
                <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-dash-success"><Check size={11} /> Active</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="text-center bg-dash-surface-2 rounded-xl py-2">
                <p className="text-dash-ink font-bold text-lg">{s.orders}</p>
                <p className="text-dash-ink-soft text-[10px]">commandes</p>
              </div>
              <div className="text-center bg-dash-surface-2 rounded-xl py-2">
                <p className="text-dash-ink font-bold text-sm">{DA(s.revenue)}</p>
                <p className="text-dash-ink-soft text-[10px]">CA livré</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => manage(s.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 ${s.id === activeId ? 'bg-dash-surface-2 text-dash-ink-soft' : 'bg-dash-accent text-white'}`}>
                {s.id === activeId ? 'Boutique active' : <>Gérer <ArrowRight size={14} /></>}
              </button>
              <button
                onClick={() => deleteStore(s.id, s.name)}
                disabled={deleting === s.id}
                className="flex-shrink-0 w-10 h-[42px] flex items-center justify-center rounded-xl bg-dash-danger-soft text-dash-danger hover:bg-dash-danger/15 transition-colors disabled:opacity-50"
                title="Supprimer la boutique"
              >
                {deleting === s.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
