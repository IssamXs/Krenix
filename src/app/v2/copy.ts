// ─── Self-contained FR/AR copy for the /v2 experimental homepage. ──────────
// Kept local to this page (like its design tokens) rather than folded into
// the shared i18n dictionaries, since this marketing copy isn't reused
// anywhere else in the app. Locale + persistence still come from the shared
// useI18n()/LocaleProvider — only the strings live here.

export type V2Locale = 'fr' | 'ar'

interface Bullet { label: string; desc: string }

export interface V2Copy {
  nav: { features: string; pricing: string; faq: string; signIn: string; cta: string }
  hero: {
    badge: string; title1: string; title2: string; desc: string
    ctaPrimary: string; ctaSecondary: string; statCommission: string; statStores: string
  }
  mockup: {
    domain: string; confirmation: string; revenue: string; wilayas: string; cmd: string
    chipTitle: string; chipDesc: string
  }
  features: { eyebrow: string; title: string; items: { title: string; desc: string }[] }
  showcaseAI: {
    eyebrow: string; title: string; desc: string; bullets: [Bullet, Bullet]
    genTitle: string; steps: [string, string, string]
  }
  showcaseShield: {
    eyebrow: string; tier: string; title: string; desc: string; bullets: [Bullet, Bullet]
    order1: string; statusReliable: string; order2: string; statusCheck: string
  }
  showcaseCoupon: {
    eyebrow: string; title: string; desc: string; bullets: [Bullet, Bullet]
    newCode: string; code: string; usesLabel: string
  }
  showcaseMobile: {
    eyebrow: string; title: string; desc: string; bullets: [Bullet, Bullet]
    notif1: string; notif2: string; notif3: string
  }
  finalCta: { title: string; desc: string; button: string }
  footer: { copyright: string; terms: string; privacy: string }
}

export const V2_COPY: Record<V2Locale, V2Copy> = {
  fr: {
    nav: { features: 'Fonctionnalités', pricing: 'Tarifs', faq: 'FAQ', signIn: 'Se connecter', cta: 'Créer ma boutique' },
    hero: {
      badge: 'La 1ère plateforme e-commerce 100% algérienne',
      title1: 'Votre boutique.',
      title2: 'En pilote automatique.',
      desc: "Landing pages générées par IA, chatbot en darija, stock par variante, sociétés de livraison connectées — tout ce qu'il faut pour vendre en ligne, sans écrire une ligne de code.",
      ctaPrimary: 'Créer ma boutique gratuitement',
      ctaSecondary: 'Voir les tarifs',
      statCommission: '0% de commission — toujours',
      statStores: 'boutiques actives',
    },
    mockup: {
      domain: 'tableau-de-bord.krenix.store',
      confirmation: 'Confirmation',
      revenue: "Chiffre d'affaires · 7j",
      wilayas: 'Meilleures wilayas',
      cmd: 'cmd',
      chipTitle: '0% commission',
      chipDesc: 'Sur chaque vente',
    },
    features: {
      eyebrow: 'Ce que vous obtenez',
      title: "Tout Shopify. Pensé pour l'Algérie.",
      items: [
        { title: '0% de commission', desc: 'Vous gardez 100% de vos ventes. Aucun prélèvement, jamais — contrairement à la plupart des plateformes.' },
        { title: 'Landing pages par IA', desc: "Décrivez votre produit, l'IA rédige le texte et génère les photos en quelques secondes." },
        { title: 'Chatbot en Darija', desc: 'Répond à vos clients 24/7, en arabe algérien, et peut créer la commande lui-même.' },
        { title: 'Stock par variante', desc: 'Couleurs et tailles avec leur propre stock — livré, le stock exact de la variante baisse, pas le total.' },
        { title: 'Livraison connectée', desc: 'Yalidine, Maystro, ZR Express... créez le colis en un clic depuis votre commande.' },
        { title: 'Analytics en direct', desc: "Marge, taux de confirmation, meilleures wilayas — votre activité en un coup d'œil." },
      ],
    },
    showcaseAI: {
      eyebrow: 'Intelligence artificielle',
      title: 'Une page de vente qui convertit, écrite pour vous',
      desc: "Donnez le nom du produit et une photo — l'IA rédige le titre, les bénéfices, les témoignages, et génère jusqu'à 5 photos produit prêtes pour vos publicités.",
      bullets: [
        { label: 'Texte + photos en un clic', desc: 'Copywriting orienté conversion, adapté au marché algérien' },
        { label: 'Publication instantanée', desc: 'En ligne sur votre boutique dès la génération terminée' },
      ],
      genTitle: 'Génération en cours…',
      steps: ['Analyse du produit', 'Rédaction du texte de vente', 'Création des visuels'],
    },
    showcaseShield: {
      eyebrow: 'Sécurité',
      tier: 'Ultimate & plus',
      title: 'Krenix Shield : votre rempart contre les fausses commandes',
      desc: "La fonctionnalité la plus demandée. Krenix analyse chaque commande — historique du numéro, cohérence de l'adresse, comportement suspect — et vous alerte avant qu'elle ne parte en livraison.",
      bullets: [
        { label: 'Détection des commandes suspectes', desc: 'Score de fiabilité calculé sur chaque nouvelle commande' },
        { label: 'Filtrage automatique', desc: 'Les commandes à risque sont isolées avant confirmation, pas après' },
      ],
      order1: 'Commande #4821', statusReliable: 'Fiable',
      order2: 'Commande #4822', statusCheck: 'À vérifier',
    },
    showcaseCoupon: {
      eyebrow: 'Ventes',
      title: 'Vos propres codes de réduction, en quelques secondes',
      desc: 'Créez un pourcentage ou un montant fixe de réduction, limitez-le dans le temps ou à un produit, et suivez exactement combien de ventes chaque code a généré.',
      bullets: [
        { label: 'Réduction en % ou montant fixe', desc: 'Vous choisissez la formule qui protège votre marge' },
        { label: 'Suivi des conversions', desc: 'Voyez quel code, quelle campagne, a réellement vendu' },
      ],
      newCode: 'Nouveau code promo', code: 'RAMADAN25', usesLabel: 'Utilisations',
    },
    showcaseMobile: {
      eyebrow: 'Mobile',
      title: 'Toute votre boutique, dans votre poche',
      desc: "Confirmez une commande à un feu rouge, changez un prix depuis le canapé, répondez à un client au marché — le tableau de bord Krenix est pensé mobile d'abord, contrôle total inclus.",
      bullets: [
        { label: 'Contrôle complet depuis le téléphone', desc: "Aucune fonctionnalité réservée à l'ordinateur" },
        { label: 'Notifications en temps réel', desc: 'Nouvelle commande, message client — vous êtes informé instantanément' },
      ],
      notif1: 'Nouvelle commande', notif2: 'Stock faible : Hoodie S', notif3: 'Message client',
    },
    finalCta: {
      title: 'Prêt à faire grandir votre boutique ?',
      desc: 'Créez votre boutique en moins de 5 minutes. Aucune carte bancaire requise pour commencer.',
      button: 'Créer ma boutique gratuitement',
    },
    footer: {
      copyright: '© {year} Krenix — La plateforme e-commerce pour les vendeurs algériens.',
      terms: 'Conditions', privacy: 'Confidentialité',
    },
  },
  ar: {
    nav: { features: 'المميزات', pricing: 'الأسعار', faq: 'الأسئلة الشائعة', signIn: 'تسجيل الدخول', cta: 'أنشئ متجرك' },
    hero: {
      badge: 'أول منصة تجارة إلكترونية جزائرية 100%',
      title1: 'متجرك.',
      title2: 'يعمل تلقائياً.',
      desc: 'صفحات هبوط بالذكاء الاصطناعي، روبوت محادثة بالدارجة، مخزون حسب الخيار، شركات توصيل متصلة — كل ما تحتاجه للبيع عبر الإنترنت، دون كتابة سطر برمجي واحد.',
      ctaPrimary: 'أنشئ متجرك مجاناً',
      ctaSecondary: 'شاهد الأسعار',
      statCommission: '0% عمولة — دائماً',
      statStores: 'متجر نشط',
    },
    mockup: {
      domain: 'tableau-de-bord.krenix.store',
      confirmation: 'نسبة التأكيد',
      revenue: 'الإيرادات · 7 أيام',
      wilayas: 'أفضل الولايات',
      cmd: 'طلب',
      chipTitle: '0% عمولة',
      chipDesc: 'على كل عملية بيع',
    },
    features: {
      eyebrow: 'ما الذي تحصل عليه',
      title: 'كل ما تقدمه Shopify. مصمم للجزائر.',
      items: [
        { title: '0% عمولة', desc: 'تحتفظ بـ100% من مبيعاتك. لا اقتطاع أبداً — على عكس معظم المنصات.' },
        { title: 'صفحات هبوط بالذكاء الاصطناعي', desc: 'صف منتجك، ويكتب الذكاء الاصطناعي النص وينشئ الصور في ثوانٍ.' },
        { title: 'روبوت محادثة بالدارجة', desc: 'يرد على عملائك على مدار الساعة، بالدارجة الجزائرية، ويمكنه إنشاء الطلب بنفسه.' },
        { title: 'مخزون حسب الخيار', desc: 'ألوان ومقاسات بمخزون خاص بها — عند التوصيل، ينقص مخزون الخيار الدقيق فقط، لا الإجمالي.' },
        { title: 'توصيل متصل', desc: 'Yalidine وMaystro وZR Express... أنشئ الطرد بنقرة واحدة من طلبك.' },
        { title: 'إحصائيات مباشرة', desc: 'الهامش، نسبة التأكيد، أفضل الولايات — نشاطك في لمحة واحدة.' },
      ],
    },
    showcaseAI: {
      eyebrow: 'الذكاء الاصطناعي',
      title: 'صفحة بيع تُقنع، مكتوبة من أجلك',
      desc: 'أدخل اسم المنتج وصورة واحدة — يكتب الذكاء الاصطناعي العنوان والمزايا والشهادات، وينشئ حتى 5 صور جاهزة لإعلاناتك.',
      bullets: [
        { label: 'نص وصور بنقرة واحدة', desc: 'محتوى موجّه للبيع، مصمم للسوق الجزائري' },
        { label: 'نشر فوري', desc: 'متاح في متجرك فور انتهاء التوليد' },
      ],
      genTitle: 'جارٍ التوليد…',
      steps: ['تحليل المنتج', 'كتابة نص البيع', 'إنشاء الصور'],
    },
    showcaseShield: {
      eyebrow: 'الأمان',
      tier: 'Ultimate وما فوق',
      title: 'Krenix Shield: درعك ضد الطلبات الوهمية',
      desc: 'الميزة الأكثر طلباً. يحلل Krenix كل طلب — سجل الرقم، تطابق العنوان، السلوك المشبوه — وينبهك قبل إرساله للتوصيل.',
      bullets: [
        { label: 'رصد الطلبات المشبوهة', desc: 'درجة موثوقية تُحسب لكل طلب جديد' },
        { label: 'تصفية تلقائية', desc: 'الطلبات الخطرة تُعزل قبل التأكيد، لا بعده' },
      ],
      order1: 'طلب #4821', statusReliable: 'موثوق',
      order2: 'طلب #4822', statusCheck: 'يحتاج تحقق',
    },
    showcaseCoupon: {
      eyebrow: 'المبيعات',
      title: 'أكواد الخصم الخاصة بك، في ثوانٍ',
      desc: 'أنشئ نسبة أو مبلغاً ثابتاً للخصم، حدده بفترة أو منتج معين، وتابع بدقة عدد المبيعات التي حققها كل كود.',
      bullets: [
        { label: 'خصم بالنسبة أو مبلغ ثابت', desc: 'اختر الصيغة التي تحافظ على هامش ربحك' },
        { label: 'تتبع التحويلات', desc: 'اعرف أي كود، وأي حملة، حقق مبيعات فعلية' },
      ],
      newCode: 'كود خصم جديد', code: 'RAMADAN25', usesLabel: 'مرات الاستخدام',
    },
    showcaseMobile: {
      eyebrow: 'الجوال',
      title: 'متجرك بالكامل، في جيبك',
      desc: 'أكّد طلباً عند إشارة المرور، غيّر سعراً من الأريكة، رد على عميل في السوق — لوحة تحكم Krenix مصممة للجوال أولاً، بتحكم كامل.',
      bullets: [
        { label: 'تحكم كامل من الهاتف', desc: 'لا ميزة محجوزة للحاسوب' },
        { label: 'إشعارات فورية', desc: 'طلب جديد، رسالة عميل — تُبلَّغ فوراً' },
      ],
      notif1: 'طلب جديد', notif2: 'مخزون منخفض: Hoodie S', notif3: 'رسالة عميل',
    },
    finalCta: {
      title: 'مستعد لتنمية متجرك؟',
      desc: 'أنشئ متجرك في أقل من 5 دقائق. لا حاجة لبطاقة بنكية للبدء.',
      button: 'أنشئ متجرك مجاناً',
    },
    footer: {
      copyright: '© {year} Krenix — منصة التجارة الإلكترونية للبائعين الجزائريين.',
      terms: 'الشروط', privacy: 'الخصوصية',
    },
  },
}
