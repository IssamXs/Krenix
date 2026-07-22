'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Truck, Table2, Tag, ShoppingCart, ChevronRight } from 'lucide-react'

const INTEGRATIONS = [
  { href: '/dashboard/integrations/delivery', icon: Truck, title: 'Sociétés de livraison', desc: 'Yalidine, Zr Express, Maystro — tarifs et suivi automatiques' },
  { href: '/dashboard/integrations/sheets', icon: Table2, title: 'Google Sheets', desc: 'Synchronisez vos commandes en temps réel vers une feuille Google' },
  { href: '/dashboard/integrations/gtm', icon: Tag, title: 'Pixels & Tag Manager', desc: 'Connectez Meta Pixel, TikTok Pixel directement, ou via Google Tag Manager' },
  { href: '/dashboard/integrations/abandoned-cart', icon: ShoppingCart, title: 'Paniers abandonnés', desc: "Relancez automatiquement les clients qui n'ont pas finalisé leur commande" },
]

export default function IntegrationsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-[11px] tracking-[0.09em] uppercase text-dash-accent font-bold">Connexions</div>
        <h1 className="dash-font-heading font-medium text-[32px] mt-1 text-dash-ink">Intégrations</h1>
      </motion.div>
      <div className="space-y-3">
        {INTEGRATIONS.map(({ href, icon: Icon, title, desc }, i) => (
          <motion.div key={href} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}>
            <Link href={href} className="flex items-center gap-4 p-5 bg-dash-surface border border-dash-border rounded-2xl hover:border-dash-accent/30 hover:shadow-[0_16px_32px_-16px_oklch(0.18_0.01_255_/_0.18)] transition-all group">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-dash-accent-soft">
                <Icon size={20} className="text-dash-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-dash-ink font-semibold text-sm">{title}</p>
                <p className="text-dash-ink-soft text-xs mt-0.5 truncate">{desc}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs px-2.5 py-1 rounded-lg font-semibold bg-dash-gold-soft text-dash-gold-dark">Configurer</span>
                <ChevronRight size={16} className="text-dash-ink-faint group-hover:text-dash-ink-soft transition-colors" />
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
