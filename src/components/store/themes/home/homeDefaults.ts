// Home theme — design tokens + French default copy.
// Warm minimal lifestyle: off-white + terracotta (green accents), soft rounded
// cards, sentence-case Sora headings / Manrope body.

export const HOME_TOKENS = {
  bg: '#F5F5F2',
  card: '#FFFFFF',
  primary: '#FF5B2E',
  secondary: '#1F8A5B',
  text: '#1A1A1A',
  textMuted: '#6B6B6B',
  border: 'rgba(0,0,0,0.07)',
  heading: 'Sora',
  body: 'Manrope',
} as const

export const HOME_DEFAULTS = {
  announcement: 'Livraison 58 wilayas · Paiement à la livraison · Emballage soigné',
  navLinks: [
    { label: 'Accueil', href: '#top' },
    { label: 'Boutique', href: '#produits' },
    { label: 'Collections', href: '#collections' },
    { label: 'Contact', href: '#contact' },
  ],
  hero: {
    kicker: 'Nouvelle collection',
    headline: 'Un intérieur qui vous ressemble',
    subtitle: 'Des objets chaleureux et durables pour transformer chaque pièce en cocon.',
    cta: 'Découvrir la boutique',
  },
  collectionsTitle: 'Nos collections',
  collections: [
    { name: 'Maison', sub: 'Déco & rangement' },
    { name: 'Cuisine', sub: 'Art de la table' },
    { name: 'Bien-être', sub: 'Ambiance & confort' },
  ],
  productsTitle: 'Nos coups de cœur',
  promo: {
    kicker: 'Offre douce',
    title: 'Sublimez votre intérieur',
    cta: 'En profiter',
    note: 'Édition limitée',
  },
  valuesTitle: 'Pourquoi nous choisir',
  values: [
    { title: 'Matières nobles', sub: 'Sélection durable & saine' },
    { title: 'Livraison soignée', sub: 'Emballage protégé, 58 wilayas' },
    { title: 'Paiement à la livraison', sub: 'En toute confiance' },
    { title: 'Service attentionné', sub: 'Une équipe à votre écoute' },
  ],
  footer: {
    tagline: 'Des objets chaleureux pour la maison, livrés avec soin partout en Algérie.',
    columns: [
      { title: 'Boutique', links: ['Nouveautés', 'Coups de cœur', 'Collections'] },
      { title: 'Aide', links: ['Livraison', 'Paiement', 'Contact'] },
    ],
  },
} as const

export const HOME_DEFAULTS_AR = {
  announcement: 'التوصيل لـ 58 ولاية · الدفع عند الاستلام · تغليف بعناية',
  navLinks: [
    { label: 'الرئيسية', href: '#top' },
    { label: 'المتجر', href: '#produits' },
    { label: 'المجموعات', href: '#collections' },
    { label: 'اتصل بنا', href: '#contact' },
  ],
  hero: {
    kicker: 'مجموعة جديدة',
    headline: 'منزل يعكس ذوقك',
    subtitle: 'قطع دافئة ومتينة تحوّل كل ركن من منزلك إلى ملاذ مريح.',
    cta: 'اكتشف المتجر',
  },
  collectionsTitle: 'مجموعاتنا',
  collections: [
    { name: 'المنزل', sub: 'ديكور وتخزين' },
    { name: 'مطبخ', sub: 'فنون المائدة' },
    { name: 'الرفاهية', sub: 'أجواء وراحة' },
  ],
  productsTitle: 'مختاراتنا',
  promo: {
    kicker: 'عرض مميز',
    title: 'أضف لمسة مميزة لمنزلك',
    cta: 'استفد الآن',
    note: 'إصدار محدود',
  },
  valuesTitle: 'لماذا تختاروننا',
  values: [
    { title: 'مواد راقية', sub: 'اختيار مستدام وصحي' },
    { title: 'توصيل بعناية', sub: 'تغليف محمي، 58 ولاية' },
    { title: 'الدفع عند الاستلام', sub: 'بكل ثقة' },
    { title: 'خدمة عناية', sub: 'فريق في خدمتك' },
  ],
  footer: {
    tagline: 'قطع دافئة لمنزلك، تصل بعناية إلى كل أنحاء الجزائر.',
    columns: [
      { title: 'المتجر', links: ['جديد', 'مختاراتنا', 'المجموعات'] },
      { title: 'المساعدة', links: ['التوصيل', 'الدفع', 'اتصل بنا'] },
    ],
  },
} as const

export function pickHomeDefaults(locale: 'fr' | 'ar') {
  return locale === 'ar' ? HOME_DEFAULTS_AR : HOME_DEFAULTS
}
