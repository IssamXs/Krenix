// Beauty theme — design tokens + French default copy.
// Editorial slots (hero/promo/about/…) use these defaults now; a later pass will
// let merchants override them from dashboard settings. One place to swap.

export const BEAUTY_TOKENS = {
  bg: '#FDEEEE',
  card: '#FFFFFF',
  primary: '#E85D5D',
  secondary: '#E8B04A',
  text: '#1A1A1A',
  textMuted: '#6B5D5A',
  border: 'rgba(232,93,93,0.14)',
  heading: 'Cormorant Garamond',
  body: 'Jost',
} as const

export const BEAUTY_DEFAULTS = {
  navLinks: [
    { label: 'Accueil', href: '#top' },
    { label: 'Boutique', href: '#produits' },
    { label: 'À propos', href: '#apropos' },
    { label: 'Contact', href: '#contact' },
  ],
  hero: {
    kicker: 'Nouvelle collection',
    headline: 'La beauté, révélée',
    subtitle: 'Des produits soigneusement sélectionnés pour sublimer votre quotidien.',
    cta: 'Découvrir la boutique',
  },
  collections: [
    { name: 'Nouveautés', sub: 'Les dernières arrivées' },
    { name: 'Meilleures ventes', sub: 'Les préférés de nos clientes' },
    { name: 'Coffrets', sub: 'Idées cadeaux' },
  ],
  promo: [
    { kicker: 'Offre du moment', title: 'Sublimez votre routine', cta: 'Voir les produits' },
    { kicker: 'Nouveauté', title: 'À découvrir absolument', cta: 'Explorer' },
  ],
  about: {
    kicker: 'À propos',
    title: 'Une sélection pensée pour vous',
    body: 'Chaque produit est choisi avec soin pour sa qualité et son efficacité. Notre mission : vous offrir le meilleur, livré partout en Algérie.',
    stats: [
      { value: '58', label: 'Wilayas livrées' },
      { value: '100%', label: 'Paiement à la livraison' },
      { value: '24-48h', label: 'Délai de livraison' },
    ],
  },
  trust: [
    { title: 'Livraison 58 wilayas', sub: 'Partout en Algérie' },
    { title: 'Paiement à la livraison', sub: 'Vérifiez avant de payer' },
    { title: 'Qualité garantie', sub: 'Produits sélectionnés' },
    { title: 'Support 7j/7', sub: 'Une équipe à votre écoute' },
  ],
  footer: {
    tagline: 'Une beauté accessible, livrée avec soin partout en Algérie.',
    columns: [
      { title: 'Boutique', links: ['Nouveautés', 'Meilleures ventes', 'Coffrets'] },
      { title: 'Aide', links: ['Livraison', 'Paiement', 'Contact'] },
    ],
  },
} as const

export const BEAUTY_DEFAULTS_AR = {
  navLinks: [
    { label: 'الرئيسية', href: '#top' },
    { label: 'المتجر', href: '#produits' },
    { label: 'من نحن', href: '#apropos' },
    { label: 'اتصل بنا', href: '#contact' },
  ],
  hero: {
    kicker: 'مجموعة جديدة',
    headline: 'الجمال، كما يليق بكِ',
    subtitle: 'منتجات مختارة بعناية لتسمو بروتينك اليومي.',
    cta: 'اكتشفي المتجر',
  },
  collections: [
    { name: 'جديد', sub: 'أحدث الوافدين' },
    { name: 'الأكثر مبيعاً', sub: 'المفضلة لدى عميلاتنا' },
    { name: 'صناديق الهدايا', sub: 'أفكار هدايا' },
  ],
  promo: [
    { kicker: 'عرض اللحظة', title: 'ارتقي بروتينك', cta: 'شاهدي المنتجات' },
    { kicker: 'جديد', title: 'يستحق الاكتشاف', cta: 'استكشفي' },
  ],
  about: {
    kicker: 'من نحن',
    title: 'مجموعة مختارة بعناية من أجلك',
    body: 'يتم اختيار كل منتج بعناية فائقة لجودته وفعاليته. مهمتنا: نقدم لكِ الأفضل، يصل إلى كل مكان في الجزائر.',
    stats: [
      { value: '58', label: 'ولاية مغطاة بالتوصيل' },
      { value: '100%', label: 'الدفع عند الاستلام' },
      { value: '24-48h', label: 'مدة التوصيل' },
    ],
  },
  trust: [
    { title: 'توصيل لـ 58 ولاية', sub: 'في جميع أنحاء الجزائر' },
    { title: 'الدفع عند الاستلام', sub: 'تحققي قبل الدفع' },
    { title: 'جودة مضمونة', sub: 'منتجات منتقاة بعناية' },
    { title: 'دعم 7/7', sub: 'فريق في خدمتك' },
  ],
  footer: {
    tagline: 'جمال في متناول الجميع، يصل بعناية إلى كل أنحاء الجزائر.',
    columns: [
      { title: 'المتجر', links: ['جديد', 'الأكثر مبيعاً', 'صناديق الهدايا'] },
      { title: 'المساعدة', links: ['التوصيل', 'الدفع', 'اتصل بنا'] },
    ],
  },
} as const

export function pickBeautyDefaults(locale: 'fr' | 'ar') {
  return locale === 'ar' ? BEAUTY_DEFAULTS_AR : BEAUTY_DEFAULTS
}
