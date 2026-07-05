import Script from 'next/script'

/**
 * Standard Google Tag Manager snippets (script + noscript fallback).
 * Rendered server-side in the storefront layout when the store has a
 * configured GTM container id (Ultimate+ plans).
 */
export default function GtmScripts({ gtmId }: { gtmId: string }) {
  // Defensive: only inject well-formed container ids into the page.
  if (!/^GTM-[A-Z0-9]{4,10}$/i.test(gtmId)) return null
  const id = gtmId.toUpperCase()

  return (
    <>
      <Script id="gtm-loader" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${id}');`}
      </Script>
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${id}`}
          height="0"
          width="0"
          style={{ display: 'none', visibility: 'hidden' }}
        />
      </noscript>
    </>
  )
}
