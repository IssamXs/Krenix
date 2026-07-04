'use client'

import { BarChart2, TrendingUp, Eye, ShoppingCart, Clock } from 'lucide-react'

const METRICS = [
  { label: 'Vues totales',         value: '—', icon: Eye,          color: '#3B82F6' },
  { label: 'Commandes',            value: '—', icon: ShoppingCart,  color: '#10B981' },
  { label: 'Taux de conversion',   value: '—', icon: TrendingUp,    color: '#F59E0B' },
  { label: 'Temps moyen sur page', value: '—', icon: Clock,         color: '#8B5CF6' },
]

export default function AnalyticsPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Analytiques avancées</h2>
        <p className="text-gray-500 text-sm mt-1">Suivez les performances de vos landing pages et produits</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {METRICS.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-[#111118] border border-white/5 rounded-2xl p-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
              style={{ background: `${color}15` }}>
              <Icon size={18} style={{ color }} />
            </div>
            <p className="text-2xl font-black text-white">{value}</p>
            <p className="text-gray-500 text-xs mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#111118] border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-4"
        style={{ minHeight: 300 }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(59,130,246,0.1)' }}>
          <BarChart2 size={28} className="text-[#3B82F6]" />
        </div>
        <div>
          <p className="text-white font-bold text-lg">Analytiques en cours de développement</p>
          <p className="text-gray-500 text-sm mt-2 max-w-md">
            Bientôt disponible : graphiques de ventes, entonnoir de conversion, heatmaps et rapports hebdomadaires automatiques.
          </p>
        </div>
        <span className="px-4 py-1.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
          Bientôt disponible
        </span>
      </div>
    </div>
  )
}
