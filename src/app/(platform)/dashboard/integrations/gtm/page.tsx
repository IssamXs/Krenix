'use client'

import { useState } from 'react'
import { Tag, Save } from 'lucide-react'

const COMMON_USES = [
  'Facebook Pixel & Conversions API',
  'Google Ads remarketing',
  'Snapchat Pixel',
  'TikTok Pixel',
  'Hotjar / Microsoft Clarity',
]

export default function GTMPage() {
  const [gtmId, setGtmId] = useState('')

  return (
    <div className="max-w-2xl space-y-6">
      <a href="/dashboard/integrations" className="text-gray-500 hover:text-white text-sm transition-colors">
        ← Intégrations
      </a>
      <div>
        <h2 className="text-2xl font-bold text-white">Google Tag Manager</h2>
        <p className="text-gray-500 text-sm mt-1">Ajoutez des scripts tiers sans modifier le code de votre boutique</p>
      </div>

      <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Tag size={16} className="text-[#F59E0B]" />
          <h3 className="text-white font-semibold text-sm">ID de conteneur GTM</h3>
        </div>
        <p className="text-gray-500 text-xs">
          Trouvez votre ID dans Google Tag Manager → Admin → Informations sur le conteneur. Format : GTM-XXXXXXX
        </p>
        <input
          value={gtmId}
          onChange={e => setGtmId(e.target.value)}
          placeholder="GTM-XXXXXXX"
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all font-mono"
        />
        <button disabled
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/5 text-gray-500 cursor-not-allowed">
          <Save size={14} /> Enregistrer (bientôt disponible)
        </button>
      </div>

      <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-3">
        <p className="text-white font-semibold text-sm">Utilisations courantes</p>
        {COMMON_USES.map(item => (
          <div key={item} className="flex items-center gap-2 text-sm text-gray-400">
            <span className="text-[#F59E0B]">→</span> {item}
          </div>
        ))}
      </div>
    </div>
  )
}
