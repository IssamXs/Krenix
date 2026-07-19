import { Lock } from 'lucide-react'
import Card from './Card'

// The "this feature needs a higher plan" banner — repeated near-identically
// across SMS, delivery, white-label, domain, team, CRM, etc. One component so
// the upgrade prompt looks and behaves the same everywhere.
export default function LockedFeatureCard({
  title, requiredPlan, upgradeLabel,
}: {
  title: string
  requiredPlan: string
  upgradeLabel?: string
}) {
  return (
    <Card className="flex items-center gap-4">
      <Lock size={20} className="text-dash-ink-faint flex-shrink-0" />
      <div>
        <p className="text-dash-ink text-sm font-semibold">{title}</p>
        <p className="text-dash-ink-soft text-xs">Disponible à partir du plan {requiredPlan}</p>
      </div>
      <a href="/dashboard/billing/upgrade" className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 bg-dash-gold-soft text-dash-gold-dark hover:opacity-80 transition-opacity">
        {upgradeLabel ?? `Passer à ${requiredPlan}`}
      </a>
    </Card>
  )
}
