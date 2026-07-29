import type { Metadata } from 'next'

// Experimental alternate homepage — for internal comparison only, not linked
// from navigation or the sitemap. noindex so it never surfaces in search
// while the owner decides whether to keep it.
export const metadata: Metadata = {
  title: 'Krenix — Votre boutique, en pilote automatique',
  robots: { index: false, follow: false },
}

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return children
}
