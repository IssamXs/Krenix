import type { Metadata, Viewport } from "next";
import { Syne, DM_Sans } from "next/font/google";
import "./globals.css";

const syne = Syne({ subsets: ["latin"], variable: "--font-heading", weight: ["400", "500", "600", "700", "800"] });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", weight: ["300", "400", "500", "600"] });

export const metadata: Metadata = {
  title: "Novalux — Créez votre boutique en ligne",
  description:
    "La plateforme SaaS pour les e-commerçants et dropshippers algériens. Boutique en ligne, landing pages IA, chatbot intégré.",
  keywords: "boutique en ligne algerie, dropshipping algerie, ecommerce algerie, novalux",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${syne.variable} ${dmSans.variable}`} data-scroll-behavior="smooth">
      <body className="antialiased overflow-x-hidden">{children}</body>
    </html>
  );
}
