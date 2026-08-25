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

export const CAR_DEFAULTS_AR = {
  announcement: 'التوصيل لـ 58 ولاية · الدفع عند الاستلام · قطع غيار مضمونة',
  navLinks: [
    { label: 'الرئيسية', href: '#top' },
    { label: 'المتجر', href: '#produits' },
    { label: 'العرض', href: '#offre' },
    { label: 'اتصل بنا', href: '#contact' },
  ],
  hero: {
    kicker: 'الأداء والأناقة',
    headline: 'جهّز سيارتك',
    subtitle: 'إكسسوارات سيارات متينة، مصممة خصيصاً للطرق الجزائرية.',
    cta: 'شاهد الكتالوج',
  },
  categoriesTitle: 'الفئات',
  categories: [
    { name: 'الداخلية', sub: 'راحة وأناقة' },
    { name: 'الخارجية', sub: 'مظهر وحماية' },
    { name: 'الأداء', sub: 'قوة وصيانة' },
  ],
  productsTitle: 'منتجات مميزة',
  deal: {
    kicker: 'عرض اللحظة',
    title: 'الحزمة التي تغيّر كل شيء',
    cta: 'استفد الآن',
    note: 'كمية محدودة',
  },
  features: [
    { title: 'متين', sub: 'مصمم ليدوم' },
    { title: 'متوافق', sub: 'مع معظم المركبات' },
    { title: 'الدفع عند الاستلام', sub: 'تحقق قبل الدفع' },
    { title: 'دعم 7/7', sub: 'نصائح الخبراء' },
  ],
  footer: {
    tagline: 'إكسسوارات سيارات موثوقة، تصل إلى جميع أنحاء الجزائر.',
    columns: [
      { title: 'المتجر', links: ['جديد', 'الأكثر مبيعاً', 'العروض'] },
      { title: 'المساعدة', links: ['التوصيل', 'الدفع', 'اتصل بنا'] },
    ],
  },
} as const

export function pickCarDefaults(locale: 'fr' | 'ar') {
  return locale === 'ar' ? CAR_DEFAULTS_AR : CAR_DEFAULTS
}
