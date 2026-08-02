// ============================================================
// KRENIX — Claude API Helper
// For AI Landing Page Generation
// Only used in: /api/ai/landing-page/route.ts
// ============================================================

import Anthropic from '@anthropic-ai/sdk'
import type { LandingPageCoreContent, LandingPageContent } from '@/types/database'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export type LandingPageStyle = 'minimaliste' | 'impact' | 'premium'
export type LandingPageLanguage = 'fr' | 'ar' | 'both'

export interface GenerateLandingPageParams {
  productName: string
  price: number
  description?: string | null
  imageUrl?: string | null
  style: LandingPageStyle
  language?: LandingPageLanguage
  storeSettings?: { whatsapp?: string }
  brief?: string | null
}

// ============================================================
// JSON STRUCTURE TEMPLATES
// ============================================================
const JSON_STRUCTURE_FR = `{
  "hero": {
    "headline": "Titre principal accrocheur (max 10 mots)",
    "subheadline": "Sous-titre avec bénéfice principal (max 20 mots)",
    "cta_text": "Texte du bouton (max 5 mots)"
  },
  "benefits": [
    { "title": "Bénéfice 1 (max 4 mots)", "description": "Description convaincante (max 25 mots)", "icon": "shield" },
    { "title": "Bénéfice 2 (max 4 mots)", "description": "Description convaincante (max 25 mots)", "icon": "star" },
    { "title": "Bénéfice 3 (max 4 mots)", "description": "Description convaincante (max 25 mots)", "icon": "truck" }
  ],
  "social_proof": {
    "review_count": "+2 300 clients satisfaits",
    "rating": "4.8",
    "testimonials": [
      { "name": "Prénom Nom algérien", "location": "Wilaya", "text": "Avis authentique (max 50 mots)", "rating": 5 },
      { "name": "Prénom Nom algérien", "location": "Wilaya", "text": "Avis authentique (max 50 mots)", "rating": 5 },
      { "name": "Prénom Nom algérien", "location": "Wilaya", "text": "Avis authentique (max 50 mots)", "rating": 4 }
    ]
  },
  "product_details": {
    "sections": [
      { "title": "Titre section 1", "content": "Contenu détaillé et convaincant" },
      { "title": "Titre section 2", "content": "Contenu détaillé et convaincant" }
    ]
  },
  "urgency": { "type": "stock", "text": "Message d'urgence crédible", "value": "23" },
  "order_form": { "title": "Titre formulaire (max 8 mots)" }
}`

const JSON_STRUCTURE_AR = `{
  "hero": {
    "headline": "عنوان رئيسي جذاب (أقصى 10 كلمات)",
    "subheadline": "عنوان فرعي مع الفائدة الأساسية (أقصى 20 كلمة)",
    "cta_text": "نص الزر (أقصى 5 كلمات)"
  },
  "benefits": [
    { "title": "ميزة 1 (أقصى 4 كلمات)", "description": "وصف مقنع (أقصى 25 كلمة)", "icon": "shield" },
    { "title": "ميزة 2 (أقصى 4 كلمات)", "description": "وصف مقنع (أقصى 25 كلمة)", "icon": "star" },
    { "title": "ميزة 3 (أقصى 4 كلمات)", "description": "وصف مقنع (أقصى 25 كلمة)", "icon": "truck" }
  ],
  "social_proof": {
    "review_count": "+2300 عميل راضٍ",
    "rating": "4.8",
    "testimonials": [
      { "name": "اسم جزائري", "location": "ولاية", "text": "تقييم حقيقي (أقصى 50 كلمة)", "rating": 5 },
      { "name": "اسم جزائري", "location": "ولاية", "text": "تقييم حقيقي (أقصى 50 كلمة)", "rating": 5 },
      { "name": "اسم جزائري", "location": "ولاية", "text": "تقييم حقيقي (أقصى 50 كلمة)", "rating": 4 }
    ]
  },
  "product_details": {
    "sections": [
      { "title": "عنوان القسم", "content": "محتوى تفصيلي مقنع" },
      { "title": "عنوان القسم 2", "content": "محتوى تفصيلي مقنع" }
    ]
  },
  "urgency": { "type": "stock", "text": "رسالة إلحاح", "value": "23" },
  "order_form": { "title": "عنوان نموذج الطلب (أقصى 8 كلمات)" }
}`

// ============================================================
// GENERATE LANDING PAGE
// ============================================================
export async function generateLandingPage({
  productName,
  price,
  description,
  imageUrl,
  style,
  language = 'fr',
  brief,
}: GenerateLandingPageParams): Promise<LandingPageContent> {

  // Each style must be recognizable from the headline alone, and carried through
  // EVERY section (benefits, testimonials, urgency) — not just the hero. A single
  // generic sentence here produced near-identical output across styles regardless
  // of selection; this gives Claude a concrete, opinionated creative brief per
  // style with explicit "avoid" lists so the three genuinely diverge.
  const styleInstructions = {
    minimaliste:
      "MINIMALISTE — épuré, confiant, sans emphase. Titre court et déclaratif (pas de point d'exclamation, pas de superlatif). " +
      "Le produit parle de lui-même, pas besoin de le crier. Bénéfices formulés comme des faits simples, pas des promesses exagérées. " +
      "Témoignages brefs et sobres (une phrase, factuelle). Urgence discrète ou absente — jamais de compte à rebours dramatique. " +
      "À ÉVITER: exclamations, majuscules pour l'emphase, mots comme 'incroyable', 'exceptionnel', 'urgent', 'dernière chance'.",
    impact:
      "IMPACT — percutant, énergique, orienté action immédiate. Titre avec verbe d'action fort, peut inclure une exclamation. " +
      "Bénéfices formulés comme des transformations concrètes et immédiates. Urgence explicite et crédible (stock limité, forte demande). " +
      "Témoignages enthousiastes, avec une émotion palpable. CTA impératif et direct ('Commandez maintenant', 'Ne ratez pas'). " +
      "À ÉVITER: ton calme ou hésitant, phrases longues et posées, vocabulaire sophistiqué/littéraire.",
    premium:
      "PREMIUM — raffiné, exclusif, vocabulaire soigné. Titre évoquant le savoir-faire, la qualité ou l'exclusivité, sans urgence ni rabais. " +
      "Bénéfices centrés sur la qualité, les matériaux, l'expérience — jamais sur le prix ou la rapidité. Aucune urgence artificielle: la rareté est " +
      "suggérée par l'exclusivité, pas par un compte à rebours. Témoignages articulés, ton aspirationnel ('une expérience différente'). " +
      "À ÉVITER: points d'exclamation, mots comme 'urgent'/'stock limité'/'promo', ton familier ou trop enthousiaste.",
  }

  const styleAR = {
    minimaliste:
      "أسلوب أنيق ومبسط — واثق وبلا مبالغة. عنوان قصير وتقريري (بدون علامة تعجب، بدون صيغة تفضيل مبالغ فيها). " +
      "المزايا تُصاغ كحقائق بسيطة، لا كوعود مبالغ فيها. آراء العملاء قصيرة وموضوعية (جملة واحدة). الإلحاح غائب أو خفيف جداً. " +
      "تجنب: علامات التعجب، كلمات مثل 'مذهل'، 'استثنائي'، 'عاجل'، 'الفرصة الأخيرة'.",
    impact:
      "أسلوب ديناميكي وجذاب — طاقة عالية ودعوة فورية للعمل. العنوان يحتوي فعل أمر قوي، يمكن أن يتضمن علامة تعجب. " +
      "المزايا تُصاغ كتحول ملموس وفوري. إلحاح صريح وموثوق (كمية محدودة، طلب كبير). آراء العملاء حماسية بمشاعر واضحة. " +
      "تجنب: نبرة هادئة أو متحفظة، جمل طويلة، مفردات أدبية معقدة.",
    premium:
      "أسلوب فاخر وراقي — مفردات منتقاة، حصرية بلا إلحاح أو تخفيضات. العنوان يوحي بالحرفية والجودة، بلا استعجال. " +
      "المزايا تركز على الجودة والخامات والتجربة، أبداً على السعر أو السرعة. لا إلحاح مصطنع. آراء العملاء معبّرة بنبرة طموحة. " +
      "تجنب: علامات التعجب، كلمات مثل 'عاجل'/'كمية محدودة'/'تخفيض'، نبرة عامية أو مفرطة الحماس.",
  }

  // Fetch + validate image before sending to Claude
  let imageBlock: {
    type: 'image'
    source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string }
  } | null = null

  if (imageUrl) {
    try {
      const imgRes = await fetch(imageUrl)
      const contentType = (imgRes.headers.get('content-type') ?? '').split(';')[0].trim()
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
      if (imgRes.ok && (validTypes as readonly string[]).includes(contentType)) {
        const buffer = await imgRes.arrayBuffer()
        imageBlock = {
          type: 'image',
          source: {
            type: 'base64',
            media_type: contentType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: Buffer.from(buffer).toString('base64'),
          },
        }
      }
    } catch {
      // Skip image if unavailable
    }
  }

  // ---- Build prompt based on language ----
  type MsgContent = { type: 'text'; text: string } | typeof imageBlock
  let messages: Anthropic.MessageParam[]

  if (language === 'both') {
    const systemBoth = `Tu es un expert en copywriting pour le e-commerce algérien.
Tu génères des pages produit qui convertissent, en DEUX langues simultanément : français et arabe.
RÈGLES ABSOLUES :
- Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ou après
- Pas de markdown, pas de \`\`\`json, juste le JSON brut
- La partie "fr" est en français algérien commercial
- La partie "ar" est en arabe moderne simple (فصحى مبسطة) adapté au marché algérien
- Les prénoms algériens sont authentiques (fr: prénoms kabyles/arabes/berbères, ar: أسماء جزائرية)
- Les wilayas sont réelles`

    const userPrompt = `Génère une page produit BILINGUE (français ET arabe) pour:

PRODUIT: ${productName}
DESCRIPTION: ${description || 'Déduis-la du contexte'}
PRIX: ${price} DZD
STYLE FR: ${styleInstructions[style]}
STYLE AR: ${styleAR[style]}
IMPORTANT: le style doit être reconnaissable dans CHAQUE section (titre, bénéfices, témoignages, urgence) — pas seulement le titre. Quelqu'un qui lit uniquement le titre doit pouvoir deviner le style choisi.
${imageBlock ? '\nUne image du produit est fournie. Analyse-la pour enrichir les deux versions.' : ''}
${brief ? `\nINSTRUCTIONS SUPPLÉMENTAIRES DU CLIENT: ${brief}` : ''}

Retourne exactement ce JSON:
{
  "fr": ${JSON_STRUCTURE_FR},
  "ar": ${JSON_STRUCTURE_AR}
}`

    const msgContent: MsgContent[] = []
    if (imageBlock) msgContent.push(imageBlock)
    msgContent.push({ type: 'text', text: userPrompt })

    messages = [{ role: 'user', content: msgContent.filter(Boolean) as Anthropic.MessageParam['content'] }]

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: systemBoth,
      messages,
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') throw new Error('Pas de réponse texte de Claude')

    const clean = textBlock.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean) as { fr: LandingPageCoreContent; ar: LandingPageCoreContent }

    return {
      ...parsed.fr,
      _ar: parsed.ar,
    }
  }

  // ---- Single language (fr or ar) ----
  const isAr = language === 'ar'

  const system = isAr
    ? `أنت خبير في كتابة المحتوى التسويقي للتجارة الإلكترونية الجزائرية.
تكتب صفحات منتجات تحقق تحويلات عالية للبائعين الجزائريين.
تكتب بالعربية الفصحى المبسطة المناسبة للسوق الجزائري.
قواعد مطلقة:
- أجب فقط بكائن JSON صحيح، بدون أي نص قبله أو بعده
- بدون markdown، بدون \`\`\`json، فقط JSON خام
- جميع النصوص بالعربية
- الأسعار دائماً بالدينار الجزائري (DZD)
- أسماء العملاء في التقييمات يجب أن تكون جزائرية أصيلة
- الإلحاح يجب أن يكون موثوقاً وغير مبالغ فيه`
    : `Tu es un expert en copywriting pour le e-commerce algérien.
Tu crées des pages produit qui convertissent pour des dropshippers algériens.
Tu écris en français avec des expressions naturelles adaptées au marché algérien.
RÈGLES ABSOLUES:
- Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ou après
- Pas de balises markdown, pas de \`\`\`json, juste le JSON brut
- Tous les textes doivent être en français
- Les prix sont toujours en DZD (Dinar Algérien)
- Les avis clients doivent paraître authentiques avec des prénoms algériens
- L'urgence doit être crédible, pas exagérée
- Si une image du produit est fournie, analyse-la pour enrichir la description`

  const promptText = isAr
    ? `اكتب صفحة منتج كاملة لـ:

المنتج: ${productName}
الوصف: ${description || 'استنتجه من السياق والصورة إن وُجدت'}
السعر: ${price} دج
أسلوب الصفحة: ${styleAR[style]}
مهم: يجب أن يظهر الأسلوب في كل قسم (العنوان، المزايا، آراء العملاء، الإلحاح) — ليس فقط العنوان. من يقرأ العنوان فقط يجب أن يتمكن من تخمين الأسلوب المختار.
${imageBlock ? '\nتم تقديم صورة المنتج. حللها لإثراء الوصف.' : ''}
${brief ? `\nتعليمات إضافية من العميل: ${brief}` : ''}

أعد هذا JSON بالضبط (استبدل جميع القيم):
${JSON_STRUCTURE_AR}`
    : `Génère une page produit complète pour:

PRODUIT: ${productName}
DESCRIPTION: ${description || "Non fournie — déduis-la du contexte et de l'image si disponible"}
PRIX: ${price} DZD
STYLE DE PAGE: ${styleInstructions[style]}
IMPORTANT: le style doit être reconnaissable dans CHAQUE section (titre, bénéfices, témoignages, urgence) — pas seulement le titre. Quelqu'un qui lit uniquement le titre doit pouvoir deviner le style choisi.
${imageBlock ? '\nUne image du produit est fournie. Analyse-la pour enrichir la description.' : ''}
${brief ? `\nINSTRUCTIONS SUPPLÉMENTAIRES DU CLIENT: ${brief}` : ''}

Retourne ce JSON exactement (remplace toutes les valeurs):
${JSON_STRUCTURE_FR}`

  const msgContent: MsgContent[] = []
  if (imageBlock) msgContent.push(imageBlock)
  msgContent.push({ type: 'text', text: promptText })

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system,
    messages: [{ role: 'user', content: msgContent.filter(Boolean) as Anthropic.MessageParam['content'] }],
  })

  const textBlock = response.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('Pas de réponse texte de Claude')

  const clean = textBlock.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(clean) as LandingPageContent
}

// ============================================================
// AI PRICE SUGGESTION (free helper — does NOT consume a credit)
// ============================================================
export type PricingTier = 'conservateur' | 'recommande' | 'agressif'

export interface PricingOption {
  tier: PricingTier
  price: number       // prix de vente suggéré, DZD
  marginDzd: number   // marge nette, DZD
  marginPct: number   // marge nette en %
  explanation: string // 1 phrase, français
}

export async function suggestPricing(costPrice: number, adBudget?: number | null): Promise<PricingOption[]> {
  const system =
    'Tu es un expert en pricing pour le e-commerce algérien. ' +
    'Tu connais le marché algérien, le pouvoir d\'achat local, ' +
    'et les marges typiques du dropshipping en Algérie. ' +
    'Réponds uniquement en JSON valide, sans markdown.'

  const budgetLine = adBudget
    ? `Budget publicitaire estimé: ${adBudget} DZD/mois. Estime un volume de commandes mensuel réaliste pour ce budget en Algérie, déduis le coût publicitaire par commande, et intègre-le dans la marge nette. Mentionne l'hypothèse de volume dans l'explication.`
    : 'Aucun budget publicitaire fourni — la marge nette = prix de vente − prix de revient.'

  const userPrompt = `Suggère 3 options de prix de vente pour un produit e-commerce vendu en Algérie.

Prix de revient (tous frais inclus): ${costPrice} DZD
${budgetLine}

Retourne EXACTEMENT ce JSON (remplace toutes les valeurs):
{
  "options": [
    { "tier": "conservateur", "price": <entier DZD>, "marginDzd": <entier DZD>, "marginPct": <entier>, "explanation": "<1 phrase courte en français>" },
    { "tier": "recommande", "price": <entier DZD>, "marginDzd": <entier DZD>, "marginPct": <entier>, "explanation": "<1 phrase courte en français>" },
    { "tier": "agressif", "price": <entier DZD>, "marginDzd": <entier DZD>, "marginPct": <entier>, "explanation": "<1 phrase courte en français>" }
  ]
}

Règles:
- conservateur: marge sûre, risque faible, prix accessible
- recommande: marge optimale pour le marché algérien
- agressif: profit maximum, prix plus élevé
- Tous les montants sont des nombres entiers en DZD, sans symbole ni séparateur
- marginPct = arrondi de (marge nette ÷ prix de vente × 100)
- Les prix doivent être crédibles pour le marché algérien (souvent arrondis à 100 DZD près)`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const textBlock = response.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('Pas de réponse de Claude')

  const clean = textBlock.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(clean) as { options: PricingOption[] }

  if (!parsed.options || !Array.isArray(parsed.options) || parsed.options.length === 0) {
    throw new Error('Réponse de pricing invalide')
  }
  return parsed.options
}

// ============================================================
// ESTIMATE TOKEN COST
// ============================================================
export function estimateCost(inputTokens: number, outputTokens: number) {
  const inputCostUSD = (inputTokens / 1_000_000) * 3
  const outputCostUSD = (outputTokens / 1_000_000) * 15
  const totalUSD = inputCostUSD + outputCostUSD
  const totalDZD = totalUSD * 260
  return {
    inputTokens,
    outputTokens,
    totalUSD: totalUSD.toFixed(4),
    totalDZD: totalDZD.toFixed(2),
  }
}
