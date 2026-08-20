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

export const SPORT_DEFAULTS_AR = {
  announcement: 'التوصيل لـ 58 ولاية · الدفع عند الاستلام · تجاوز حدودك',
  navLinks: [
    { label: 'الرئيسية', href: '#top' },
    { label: 'المتجر', href: '#produits' },
    { label: 'الأهداف', href: '#objectifs' },
    { label: 'اتصل بنا', href: '#contact' },
  ],
  hero: {
    kicker: 'تجاوز حدودك',
    headline: 'أقوى كل يوم',
    subtitle: 'المعدات التي تحوّل مجهودك إلى نتائج. بلا أعذار.',
    cta: 'أبدأ الآن',
  },
  pathsTitle: 'اختر هدفك',
  paths: [
    { name: 'قوة', sub: 'زيادة الكتلة والقوة' },
    { name: 'تحمّل', sub: 'كارديو ومقاومة' },
    { name: 'الاستشفاء', sub: 'مرونة وراحة' },
  ],
  productsTitle: 'معداتنا',
  statsTitle: 'نتائج تتحدث عن نفسها',
  stats: [
    { value: '10K+', label: 'رياضي مجهز' },
    { value: '58', label: 'ولاية مغطاة بالتوصيل' },
    { value: '4.9/5', label: 'التقييم المتوسط' },
  ],
  transformationsTitle: 'قصص نجاح',
  transformations: [
    { name: 'سفيان', location: 'قسنطينة', text: 'أخيراً معدات جدية. تدريباتي وصلت لمستوى آخر.' },
    { name: 'أمين', location: 'الجزائر العاصمة', text: 'جودة ثابتة وتوصيل سريع. أنصح بها 100%.' },
    { name: 'ياسمين', location: 'وهران', text: 'مثالية للتمرين في المنزل. نتائج ملحوظة خلال أسابيع.' },
  ],
  footer: {
    tagline: 'معدات رياضية تدفعك للأمام، تصل إلى كل أنحاء الجزائر.',
    columns: [
      { title: 'المتجر', links: ['جديد', 'الأكثر مبيعاً', 'الأهداف'] },
      { title: 'المساعدة', links: ['التوصيل', 'الدفع', 'اتصل بنا'] },
    ],
  },
} as const

export function pickSportDefaults(locale: 'fr' | 'ar') {
  return locale === 'ar' ? SPORT_DEFAULTS_AR : SPORT_DEFAULTS
}
