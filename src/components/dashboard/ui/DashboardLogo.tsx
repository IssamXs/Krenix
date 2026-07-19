import Image from 'next/image'

// ============================================================
// Krenix brand mark for the redesigned (Éclat) dashboard.
//
// Single, isolated component so the logo is a one-file change everywhere
// it appears in the dashboard (sidebar header, Settings). Renders the
// teal-phoenix mark (background-removed) on a subtle tile that reads well
// on the dark Éclat sidebar. `initial` is accepted for API compatibility
// with white-label callers but unused for the Krenix default mark.
// ============================================================
export default function DashboardLogo({ size = 38 }: { size?: number; initial?: string }) {
  // No tile/background — the phoenix PNG is transparent and sits directly on
  // the sidebar (the previous bg-white/[0.06] tile read as a black square).
  return (
    <Image
      src="/brand/krenix-phoenix.png"
      alt="Krenix"
      width={size}
      height={size}
      unoptimized
      priority
      className="flex-shrink-0"
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}
