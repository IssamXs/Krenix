// Car theme — design tokens + French default copy.
// Bold automotive: high-contrast light + aggressive red/black, a dark hero band,
// condensed uppercase headings (Barlow Condensed).

export const CAR_TOKENS = {
  bg: '#F4F4F4',
  card: '#FFFFFF',
  primary: '#E62E2D',
  secondary: '#111111',
  text: '#111111',
  textMuted: '#6B6B6B',
  border: 'rgba(0,0,0,0.09)',
  heading: 'Barlow Condensed',
  body: 'Barlow',
} as const

export const CAR_DEFAULTS = {
  announcement: 'Livraison 58 wilayas · Paiement à la livraison · Pièces garanties',
  navLinks: [
    { label: 'Accueil', href: '#top' },
    { label: 'Boutique', href: '#produits' },
    { label: 'Offre', href: '#offre' },
    { label: 'Contact', href: '#contact' },
  ],
  hero: {
    kicker: 'Performance & Style',
    headline: 'ÉQUIPE TA MACHINE',
    subtitle: 'Des accessoires auto robustes, pensés pour la route algérienne.',
    cta: 'Voir le catalogue',
  },
  categoriesTitle: 'Catégories',
  categories: [
    { name: 'Intérieur', sub: 'Confort & style' },
    { name: 'Extérieur', sub: 'Look & protection' },
    { name: 'Performance', sub: 'Puissance & entretien' },
  ],
  productsTitle: 'Produits en vedette',
  deal: {
    kicker: 'Offre du moment',
    title: 'Le pack qui change tout',
    cta: 'J’en profite',
    note: 'Stock limité',
  },
  features: [
    { title: 'Robuste', sub: 'Testé pour durer' },
    { title: 'Compatible', sub: 'La plupart des véhicules' },
    { title: 'Paiement à la livraison', sub: 'Vérifiez avant de payer' },
    { title: 'Support 7j/7', sub: 'Conseils d’experts' },
  ],
  footer: {
    tagline: 'Des accessoires auto fiables, livrés partout en Algérie.',
    columns: [
      { title: 'Boutique', links: ['Nouveautés', 'Best-sellers', 'Offres'] },
      { title: 'Aide', links: ['Livraison', 'Paiement', 'Contact'] },
    ],
  },
} as const
