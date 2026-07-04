// Sport theme — design tokens + French default copy.
// Dark, athletic, high-energy: near-black + electric lime, condensed uppercase
// headings (Barlow Condensed). Editable slots read store.settings.storeContent first.

export const SPORT_TOKENS = {
  bg: '#141414',
  card: '#1C1C1C',
  primary: '#DFFF3A',
  secondary: '#C9D048',
  text: '#FFFFFF',
  textMuted: '#8F8F8F',
  border: 'rgba(223,255,58,0.18)',
  heading: 'Barlow Condensed',
  body: 'Barlow',
} as const

export const SPORT_DEFAULTS = {
  announcement: 'Livraison 58 wilayas · Paiement à la livraison · Dépasse tes limites',
  navLinks: [
    { label: 'Accueil', href: '#top' },
    { label: 'Boutique', href: '#produits' },
    { label: 'Objectifs', href: '#objectifs' },
    { label: 'Contact', href: '#contact' },
  ],
  hero: {
    kicker: 'Dépasse tes limites',
    headline: 'PLUS FORT CHAQUE JOUR',
    subtitle: 'L’équipement qui transforme l’effort en résultats. Sans excuses.',
    cta: 'Je commence',
  },
  pathsTitle: 'Choisis ton objectif',
  paths: [
    { name: 'Force', sub: 'Prise de masse & puissance' },
    { name: 'Endurance', sub: 'Cardio & résistance' },
    { name: 'Récupération', sub: 'Mobilité & bien-être' },
  ],
  productsTitle: 'Notre équipement',
  statsTitle: 'Des résultats qui parlent',
  stats: [
    { value: '10K+', label: 'Sportifs équipés' },
    { value: '58', label: 'Wilayas livrées' },
    { value: '4.9/5', label: 'Note moyenne' },
  ],
  transformationsTitle: 'Ils ont réussi',
  transformations: [
    { name: 'Sofiane', location: 'Constantine', text: 'Enfin du matériel sérieux. Mes séances sont passées à un autre niveau.' },
    { name: 'Amine', location: 'Alger', text: 'Qualité au rendez-vous et livraison rapide. Je recommande à 100%.' },
    { name: 'Yasmine', location: 'Oran', text: 'Parfait pour m’entraîner à la maison. Résultats visibles en quelques semaines.' },
  ],
  footer: {
    tagline: 'L’équipement sportif qui te pousse plus loin, livré partout en Algérie.',
    columns: [
      { title: 'Boutique', links: ['Nouveautés', 'Best-sellers', 'Objectifs'] },
      { title: 'Aide', links: ['Livraison', 'Paiement', 'Contact'] },
    ],
  },
} as const
