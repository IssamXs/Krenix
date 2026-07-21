'use client'

import KrenixLogo from '@/components/ui/KrenixLogo'

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-dash-page relative overflow-hidden dash-font-sans">
      {/* Soft Éclat glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full blur-[140px]" style={{ background: 'var(--color-dash-accent-soft)' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 border-b border-dash-border">
        <div className="flex items-center gap-2">
          <KrenixLogo height={40} compact />
          <span className="dash-font-heading text-xl font-medium text-dash-ink tracking-tight">Krenix</span>
        </div>
        <p className="text-dash-ink-faint text-sm hidden sm:block">Configuration initiale</p>
      </header>

      {/* Content */}
      <main className="relative z-10">
        {children}
      </main>
    </div>
  )
}
