'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { setActiveStoreId, getActiveStoreId } from '@/lib/active-store'
import { AGENCY_PLANS, PLAN_STORE_LIMITS, PLAN_LABELS, type Plan } from '@/types/database'
import { Store as StoreIcon, Loader2, Lock, Plus, ArrowRight, Check } from 'lucide-react'

interface StoreRow {
  id: string
  name: string
  slug: string
  plan: Plan
  orders: number
  revenue: number
}

const DA = (n: number) => `${Math.round(n).toLocaleString('fr-DZ')} DA`

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

  const manage = (id: string) => {
    setActiveStoreId(id)
    setActiveId(id)
    router.push('/dashboard')
  }

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-[#3B82F6]" size={26} /></div>
  }

  if (!allowed) {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Agence</h2>
          <p className="text-gray-500 text-sm mt-1">Gérez plusieurs boutiques depuis un seul compte</p>
        </div>
        <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 flex items-center gap-4 opacity-70">
          <Lock size={20} className="text-gray-500 flex-shrink-0" />
          <div>
            <p className="text-white text-sm font-semibold">Vue multi-boutiques</p>
            <p className="text-gray-500 text-xs">Disponible à partir du plan Agency</p>
          </div>
          <a href="/dashboard/billing/upgrade" className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
            Passer à Agency
          </a>
        </div>
      </div>
    )
  }

  const limit = ownerPlan ? PLAN_STORE_LIMITS[ownerPlan] : 1
  const canCreate = stores.length < limit

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white">Agence</h2>
          <p className="text-gray-500 text-sm mt-1">
            {stores.length} boutique{stores.length !== 1 ? 's' : ''} · {Number.isFinite(limit) ? `${limit} max` : 'illimité'}
          </p>
        </div>
        {canCreate ? (
          <button onClick={() => router.push('/onboarding/step-1?new=1')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white font-semibold text-sm hover:opacity-90 transition-all">
            <Plus size={16} /> Nouvelle boutique
          </button>
        ) : (
          <span className="text-xs text-gray-500">Limite de boutiques atteinte</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {stores.map(s => (
          <div key={s.id} className="bg-[#111118] border rounded-2xl p-5" style={{ borderColor: s.id === activeId ? '#3B82F633' : 'rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(59,130,246,0.12)' }}>
                <StoreIcon size={18} className="text-[#3B82F6]" />
              </div>
              <div className="min-w-0">
                <p className="text-white font-semibold text-sm truncate">{s.name}</p>
                <p className="text-gray-500 text-xs">{PLAN_LABELS[s.plan]}</p>
              </div>
              {s.id === activeId && (
                <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-green-400"><Check size={11} /> Active</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="text-center bg-white/3 rounded-xl py-2">
                <p className="text-white font-bold text-lg">{s.orders}</p>
                <p className="text-gray-500 text-[10px]">commandes</p>
              </div>
              <div className="text-center bg-white/3 rounded-xl py-2">
                <p className="text-white font-bold text-sm">{DA(s.revenue)}</p>
                <p className="text-gray-500 text-[10px]">CA livré</p>
              </div>
            </div>
            <button onClick={() => manage(s.id)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: s.id === activeId ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #3B82F6, #2563EB)', color: s.id === activeId ? '#9CA3AF' : '#fff' }}>
              {s.id === activeId ? 'Boutique active' : <>Gérer <ArrowRight size={14} /></>}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
