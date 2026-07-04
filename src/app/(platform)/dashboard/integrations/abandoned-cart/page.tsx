'use client'

import { ShoppingCart } from 'lucide-react'

const STATS = [
  { label: 'Visiteurs captés',    value: '—' },
  { label: 'Relances envoyées',   value: '—' },
  { label: 'Récupérés',           value: '—' },
]

export default function AbandonedCartPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <a href="/dashboard/integrations" className="text-gray-500 hover:text-white text-sm transition-colors">
        ← Intégrations
      </a>
      <div>
        <h2 className="text-2xl font-bold text-white">Récupération de paniers abandonnés</h2>
        <p className="text-gray-500 text-sm mt-1">Relancez automatiquement les clients qui n&apos;ont pas finalisé leur commande</p>
      </div>
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-8 flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-red-500/10">
          <ShoppingCart size={28} className="text-red-400" />
        </div>
        <p className="text-white font-bold text-lg">Relance automatique</p>
        <p className="text-gray-500 text-sm max-w-sm">
          Détectez les visiteurs qui ont rempli leur nom et téléphone mais n&apos;ont pas commandé. Un message WhatsApp automatique sera envoyé après 30 minutes.
        </p>
        <div className="grid grid-cols-3 gap-4 w-full mt-2">
          {STATS.map(s => (
            <div key={s.label} className="rounded-xl p-4 text-center border border-white/5"
              style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-2xl font-black text-white">{s.value}</p>
              <p className="text-gray-500 text-xs mt-1">{s.label}</p>
            </div>
          ))}
        </div>
        <span className="px-4 py-1.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
          Bientôt disponible
        </span>
      </div>
    </div>
  )
}
