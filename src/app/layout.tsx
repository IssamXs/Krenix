import type { Metadata, Viewport } from "next";
import { Syne, DM_Sans, Fraunces, Plus_Jakarta_Sans, IBM_Plex_Sans_Arabic, Noto_Kufi_Arabic } from "next/font/google";
import { headers } from "next/headers";
import MarketingPixel from "@/components/MarketingPixel";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { dirFor } from "@/lib/i18n/config";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import "./globals.css";

const syne = Syne({ subsets: ["latin"], variable: "--font-heading", weight: ["400", "500", "600", "700", "800"] });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", weight: ["300", "400", "500", "600"] });

// Dashboard-only typography (Éclat redesign). Scoped via their own CSS
// variables so the public marketing/storefront pages — still on Syne/DM
// Sans — are completely unaffected; only components that reference
// --font-dash-heading/--font-dash-sans opt in.
//
// Fraunces (heading) / Plus Jakarta Sans (body): heavier, warmer strokes than
// the previous Bodoni Moda/Manrope pairing at the same numeric weights — a
// deliberately thicker, more premium look across every dashboard surface.
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-dash-heading", weight: ["500", "600", "700"], style: ["normal", "italic"] });
const plusJakartaSans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-dash-sans", weight: ["400", "500", "600", "700", "800"] });

// Arabic dashboard typography. Fraunces/Plus Jakarta Sans have no Arabic
// glyphs, so locale=ar swaps to these via a `:root[data-locale="ar"]` override in
// globals.css that reassigns --font-dash-heading/--font-dash-sans — every
// component already using .dash-font-heading/.dash-font-sans picks this up
// automatically, no per-component changes needed.
const notoKufiArabic = Noto_Kufi_Arabic({ subsets: ["arabic"], variable: "--font-dash-heading-ar", weight: ["500", "600", "700"] });
const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], variable: "--font-dash-sans-ar", weight: ["400", "500", "600", "700"] });

const SITE_DESCRIPTION =
  "La plateforme SaaS pour les e-commerçants et dropshippers algériens. Boutique en ligne, landing pages IA, chatbot intégré.";

export const metadata: Metadata = {
  metadataBase: new URL("https://krenix.store"),
  title: "Krenix — Créez votre boutique en ligne",
  description: SITE_DESCRIPTION,
  keywords: "boutique en ligne algerie, dropshipping algerie, ecommerce algerie, krenix",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Krenix — Créez votre boutique en ligne",
    description: SITE_DESCRIPTION,
    url: "https://krenix.store",
    siteName: "Krenix",
    images: [{ url: "/brand/krenix-cover.png", width: 1640, height: 624 }],
    locale: "fr_FR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Krenix — Créez votre boutique en ligne",
    description: SITE_DESCRIPTION,
    images: ["/brand/krenix-cover.png"],
  },
  verification: {
    other: {
      "facebook-domain-verification": "jyrfx9smjydv49fhec9eivo76fror9",
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Storefronts already inject their own merchant-configured pixel
  // (PixelScripts, in src/app/store/layout.tsx). This root layout also wraps
  // every store subdomain request (middleware rewrites into /store/*), so the
  // marketing pixel must be skipped there — otherwise every customer visit to
  // every merchant's shop would also fire into Krenix's own ad pixel,
  // corrupting both the merchant's data and Krenix's.
  const isStore = (await headers()).get('x-is-store') === 'true'
  const locale = await getServerLocale()

  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      data-locale={locale}
      className={`${syne.variable} ${dmSans.variable} ${fraunces.variable} ${plusJakartaSans.variable} ${notoKufiArabic.variable} ${ibmPlexSansArabic.variable}`}
      data-scroll-behavior="smooth"
    >
      <body className="antialiased overflow-x-hidden">
        <LocaleProvider initialLocale={locale}>
          {!isStore && <MarketingPixel />}
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
