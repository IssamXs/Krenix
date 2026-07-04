'use client'

import { Table2, ExternalLink } from 'lucide-react'

export default function SheetsIntegrationPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <a href="/dashboard/integrations" className="text-gray-500 hover:text-white text-sm transition-colors">
        ← Intégrations
      </a>
      <div>
        <h2 className="text-2xl font-bold text-white">Google Sheets</h2>
        <p className="text-gray-500 text-sm mt-1">Exportez automatiquement chaque nouvelle commande vers une feuille Google</p>
      </div>
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-8 flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(52,211,153,0.1)' }}>
          <Table2 size={28} className="text-emerald-400" />
        </div>
        <p className="text-white font-bold text-lg">Synchronisation Google Sheets</p>
        <p className="text-gray-500 text-sm max-w-sm">
          Chaque commande sera automatiquement ajoutée à votre feuille avec : nom, téléphone, wilaya, produit, montant et statut.
        </p>
        <button disabled
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm bg-white/5 text-gray-500 cursor-not-allowed">
          <ExternalLink size={16} /> Connecter Google Sheets
        </button>
        <span className="px-4 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Bientôt disponible
        </span>
      </div>
    </div>
  )
}
