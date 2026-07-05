'use client'

import Link from 'next/link'
import { Truck, Table2, Tag, ShoppingCart, ChevronRight } from 'lucide-react'

const INTEGRATIONS = [
  {
    href: '/dashboard/integrations/delivery',
    icon: Truck, color: '#10B981',
    title: 'Sociétés de livraison',
    desc: 'Yalidine, Zr Express, Maystro — tarifs et suivi automatiques',
    badge: 'Configurer',
  },
  {
    href: '/dashboard/integrations/sheets',
    icon: Table2, color: '#34D399',
    title: 'Google Sheets',
    desc: 'Synchronisez vos commandes en temps réel vers une feuille Google',
    badge: 'Configurer',
  },
  {
    href: '/dashboard/integrations/gtm',
    icon: Tag, color: '#F59E0B',
    title: 'Google Tag Manager',
    desc: 'Ajoutez facilement Facebook Pixel, Google Ads, et autres scripts',
    badge: 'Configurer',
  },
  {
    href: '/dashboard/integrations/abandoned-cart',
    icon: ShoppingCart, color: '#EF4444',
    title: 'Paniers abandonnés',
    desc: "Relancez automatiquement les clients qui n'ont pas finalisé leur commande",
    badge: 'Configurer',
  },
]

export default function IntegrationsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Intégrations</h2>
        <p className="text-gray-500 text-sm mt-1">Connectez des outils tiers à votre boutique</p>
      </div>
      <div className="space-y-3">
        {INTEGRATIONS.map(({ href, icon: Icon, color, title, desc, badge }) => (
          <Link key={href} href={href}
            className="flex items-center gap-4 p-5 bg-[#111118] border border-white/5 rounded-2xl hover:border-white/10 transition-all group">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${color}15` }}>
              <Icon size={20} style={{ color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">{title}</p>
              <p className="text-gray-500 text-xs mt-0.5 truncate">{desc}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs px-2.5 py-1 rounded-lg font-semibold"
                style={{
                  background: badge === 'Configurer' ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                  color: badge === 'Configurer' ? '#F59E0B' : '#6B7280',
                }}>
                {badge}
              </span>
              <ChevronRight size={16} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
