'use client'

import Image from 'next/image'
import { Truck } from 'lucide-react'

const COMPANIES = [
  {
    name: 'Yalidine',
    logo: '/logos/yalidine.jpg',
    desc: 'Leader du marché — API disponible',
    status: 'Bientôt',
    bg: '#C8201C',
  },
  {
    name: 'ZR Express',
    logo: '/logos/zr-express.jpg',
    desc: 'Couverture nationale — tarifs compétitifs',
    status: 'Bientôt',
    bg: '#ffffff',
  },
  {
    name: 'Maystro',
    logo: '/logos/maystro.jpg',
    desc: 'Suivi en temps réel',
    status: 'Bientôt',
    bg: '#1B9BE2',
  },
]

export default function DeliveryIntegrationsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <a href="/dashboard/integrations" className="text-gray-500 hover:text-white text-sm transition-colors">
        ← Intégrations
      </a>
      <div>
        <h2 className="text-2xl font-bold text-white">Sociétés de livraison</h2>
        <p className="text-gray-500 text-sm mt-1">Connectez votre compte livreur pour automatiser les expéditions</p>
      </div>

      {COMPANIES.map(c => (
        <div key={c.name} className="bg-[#111118] border border-white/5 rounded-2xl p-5 flex items-center gap-5">
          <div
            className="w-32 h-20 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center p-2"
            style={{ background: c.bg }}
          >
            <Image
              src={c.logo}
              alt={c.name}
              width={160}
              height={96}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex-1">
            <p className="text-white font-semibold text-lg">{c.name}</p>
            <p className="text-gray-500 text-sm mt-0.5">{c.desc}</p>
          </div>
          <span className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-500 font-semibold flex-shrink-0">
            {c.status}
          </span>
        </div>
      ))}

      <div className="bg-[#111118] border border-white/5 rounded-2xl p-6 text-center">
        <Truck size={32} className="mx-auto mb-3 text-gray-600" />
        <p className="text-white font-semibold">Intégration API en développement</p>
        <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
          Les intégrations permettront la création automatique de livraisons, le suivi des colis et la mise à jour des statuts de commande.
        </p>
      </div>
    </div>
  )
}
