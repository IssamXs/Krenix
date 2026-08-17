import Card from '@/components/dashboard/ui/Card'

// Full-page "coming soon" state shown at every Site Builder entry point while
// SITE_BUILDER_ENABLED is false — unlike LockedFeatureCard (which frames
// things as "upgrade your plan"), this is a genuinely unbuilt-for-now
// feature, not a paywall, so it never mentions plans or pricing.
export default function SiteBuilderLocked() {
  return (
    <div className="max-w-2xl">
      <Card className="flex flex-col items-center text-center gap-3 py-14">
        <div className="w-11 h-11 rounded-full bg-dash-gold-soft flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-dash-gold-dark)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" />
            <path d="M8 10.5V7.8a4 4 0 018 0v2.7" />
          </svg>
        </div>
        <p className="dash-font-heading font-medium text-lg text-dash-ink">Bientôt disponible</p>
        <p className="text-dash-ink-soft text-sm max-w-sm leading-relaxed">
          Le constructeur de site est en cours de finalisation. Vous pourrez bientôt créer et publier vos propres pages personnalisées.
        </p>
      </Card>
    </div>
  )
}
