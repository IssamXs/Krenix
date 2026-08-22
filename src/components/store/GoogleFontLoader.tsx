'use client'

// Loads per-store custom Google Fonts stylesheet(s) WITHOUT blocking first paint.
// A plain `<link rel="stylesheet">` is render-blocking: if fonts.googleapis.com
// is slow or times out (spotty mobile data, blocked/throttled DNS — common on
// Algerian mobile networks), the entire storefront stays blank until it
// resolves, which can take many seconds. Loading it with `media="print"`
// downloads it in parallel without blocking render; the onLoad swap to
// `media="all"` applies it the moment it's ready. <noscript> covers non-JS
// clients (crawlers, etc.) with the original blocking behavior as a fallback.
export default function GoogleFontLoader({
  href,
  arabic = false,
}: {
  href?: string | null
  arabic?: boolean
}) {
  const arabicHref = arabic
    ? 'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap'
    : null

  if (!href && !arabicHref) return null

  const links: string[] = []
  if (href) links.push(href)
  if (arabicHref) links.push(arabicHref)

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {links.map((h) => (
        <link
          key={h}
          rel="stylesheet"
          href={h}
          media="print"
          onLoad={(e) => { (e.currentTarget as HTMLLinkElement).media = 'all' }}
        />
      ))}
      <noscript>
        {links.map((h) => <link key={h} rel="stylesheet" href={h} />)}
      </noscript>
    </>
  )
}
