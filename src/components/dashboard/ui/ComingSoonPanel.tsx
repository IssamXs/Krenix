import Card from './Card'

// Locked/teaser panel for a planned-but-unbuilt feature — the mockup's
// pattern for "Prévisions de demande" (AI stock forecasting) and "Tests A/B"
// (though Krenix already ships real A/B testing, gated by plan — this
// component is only for genuinely unbuilt features, not a paywall).
export default function ComingSoonPanel({
  eyebrow, title, description, delayMs = 0, preview,
}: {
  eyebrow: string
  title: string
  description: string
  delayMs?: number
  preview: React.ReactNode
}) {
  return (
    <Card delayMs={delayMs} className="relative overflow-hidden" style={{ minHeight: 150 }}>
      <div className="grayscale-[0.6] opacity-45 pointer-events-none">
        <div className="text-[11px] tracking-[0.08em] uppercase text-dash-gold font-bold">{eyebrow}</div>
        <div className="text-[14.5px] font-bold mt-1.5 text-dash-ink">{title}</div>
        {preview}
      </div>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 bottom-0 w-[45%]"
          style={{
            background: 'linear-gradient(100deg, transparent, oklch(1 0 0 / 0.4), transparent)',
            animation: 'dashShimmerSweep 3.2s ease-in-out infinite',
          }}
        />
      </div>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-5 text-center"
        style={{ background: 'linear-gradient(to bottom, oklch(0.995 0.003 255 / 0.2), oklch(0.995 0.003 255 / 0.92))' }}
      >
        <div className="w-[34px] h-[34px] rounded-full bg-dash-gold-soft flex items-center justify-center">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-dash-gold-dark)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" />
            <path d="M8 10.5V7.8a4 4 0 018 0v2.7" />
          </svg>
        </div>
        <div className="text-[13px] font-bold text-dash-ink">Bientôt disponible</div>
        <div className="text-[11.5px] text-dash-ink-soft leading-relaxed max-w-[210px]">{description}</div>
      </div>
    </Card>
  )
}
