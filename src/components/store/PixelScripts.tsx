import Script from 'next/script'

/**
 * Direct Meta/TikTok pixel injection — an alternative to Google Tag Manager
 * for merchants who don't want to set up a GTM container themselves. Renders
 * the standard base pixel snippet (PageView / page event) for whichever ids
 * are configured; both can be set independently or alongside GTM.
 */
export default function PixelScripts({ metaPixelId, tiktokPixelId }: { metaPixelId?: string; tiktokPixelId?: string }) {
  // Defensive: Meta pixel ids are numeric, TikTok pixel ids are alphanumeric.
  const meta = metaPixelId && /^[0-9]{10,20}$/.test(metaPixelId) ? metaPixelId : null
  const tiktok = tiktokPixelId && /^[A-Z0-9]{10,30}$/i.test(tiktokPixelId) ? tiktokPixelId : null

  return (
    <>
      {meta && (
        <Script id="meta-pixel-loader" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${meta}');
fbq('track', 'PageView');`}
        </Script>
      )}
      {tiktok && (
        <Script id="tiktok-pixel-loader" strategy="afterInteractive">
          {`!function (w, d, t) {
w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<e.methods.length;n++)ttq.setAndDefer(e,e.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var ttq_scr=document.createElement("script");ttq_scr.type="text/javascript",ttq_scr.async=!0,ttq_scr.src=i+"?sdkid="+e+"&lib="+t;var script=document.getElementsByTagName("script")[0];script.parentNode.insertBefore(ttq_scr,script)};
ttq.load('${tiktok}');
ttq.page();
}(window, document, 'ttq');`}
        </Script>
      )}
    </>
  )
}
