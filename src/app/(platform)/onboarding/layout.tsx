'use client'

import KrenixLogo from '@/components/ui/KrenixLogo'

const STEPS = [
  { num: 1, label: 'Votre boutique' },
  { num: 2, label: 'Logo' },
  { num: 3, label: 'Thème' },
  { num: 4, label: 'Premier produit' },
]

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0A0A0F] relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#3B82F6]/4 rounded-full blur-[140px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 border-b border-white/5">
        <KrenixLogo height={28} color="#fff" />
        <p className="text-gray-500 text-sm hidden sm:block">Configuration initiale</p>
      </header>

      {/* Content */}
      <main className="relative z-10">
        {children}
      </main>
    </div>
  )
}
