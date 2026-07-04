// Tech theme — design tokens + French default copy.
// Clean, minimal, tech-commerce: white + lime green, Poppins throughout.
// Editable slots read store.settings.storeContent first, then these defaults.

export const TECH_TOKENS = {
  bg: '#FFFFFF',
  card: '#F5F5F5',
  primary: '#8BC34A',
  secondary: '#F5A623',
  text: '#1A1A1A',
  textMuted: '#6B7280',
  border: 'rgba(0,0,0,0.08)',
  heading: 'Poppins',
  body: 'Poppins',
} as const

export const TECH_DEFAULTS = {
  announcement: 'Livraison 58 wilayas · Paiement à la livraison · Garantie 12 mois',
  navLinks: [
    { label: 'Accueil', href: '#top' },
    { label: 'Boutique', href: '#produits' },
    { label: 'Offre', href: '#offre' },
    { label: 'Contact', href: '#contact' },
  ],
  hero: {
    kicker: 'Nouvelle technologie',
    headline: 'La tech qui suit le rythme',
    subtitle: 'Des produits intelligents pour un quotidien connecté, sans compromis.',
    cta: 'Explorer la boutique',
  },
  popularTitle: 'Produits populaires',
  hotDeal: {
    kicker: 'Offre de la semaine',
    title: 'Ne manquez pas cette offre',
    cta: 'J’en profite',
    note: 'Offre limitée',
  },
  features: [
    { title: 'Livraison rapide', sub: '58 wilayas, 24-48h' },
    { title: 'Paiement à la livraison', sub: 'Vérifiez avant de payer' },
    { title: 'Garantie 12 mois', sub: 'Produits testés' },
    { title: 'Support 7j/7', sub: 'Une équipe réactive' },
  ],
  footer: {
    tagline: 'La technologie accessible, livrée partout en Algérie.',
    columns: [
      { title: 'Boutique', links: ['Nouveautés', 'Populaires', 'Offres'] },
      { title: 'Aide', links: ['Livraison', 'Paiement', 'Contact'] },
    ],
  },
} as const
