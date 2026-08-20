'use client'

// Loads a per-store custom Google Fonts stylesheet WITHOUT blocking first paint.
// A plain `<link rel="stylesheet">` is render-blocking: if fonts.googleapis.com
// is slow or times out (spotty mobile data, blocked/throttled DNS — common on
// Algerian mobile networks), the entire storefront stays blank until it
// resolves, which can take many seconds. Loading it with `media="print"`
// downloads it in parallel without blocking render; the onLoad swap to
// `media="all"` applies it the moment it's ready. <noscript> covers non-JS
// clients (crawlers, etc.) with the original blocking behavior as a fallback.
export default function GoogleFontLoader({ href }: { href?: string | null }) {
  if (!href) return null
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href={href}
        media="print"
        onLoad={e => { (e.currentTarget as HTMLLinkElement).media = 'all' }}
      />
      <noscript>
        <link rel="stylesheet" href={href} />
      </noscript>
    </>
  )
}
