// ============================================================
// KRENIX — Gemini API Helper
// For AI Chatbot (Ultimate tier only)
// Only used in: /api/ai/chatbot/route.ts
// ============================================================

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ChatMessage, Product, ChatbotTone } from '@/types/database'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

// ============================================================
// ORDER EXTRACTION
// When chatbot collects all info, it returns this prefix
// ============================================================
export const ORDER_READY_PREFIX = 'ORDER_READY:'

export interface ChatbotOrderData {
  customer_name: string
  customer_phone: string
  wilaya: string
  commune: string
  quantity: number
  color?: string
  size?: string
  product_id: string
  product_name: string
  unit_price: number
}

export function extractOrder(response: string): ChatbotOrderData | null {
  if (!response.includes(ORDER_READY_PREFIX)) return null
  
  try {
    const jsonStart = response.indexOf(ORDER_READY_PREFIX) + ORDER_READY_PREFIX.length
    const jsonStr = response.substring(jsonStart).trim()
    return JSON.parse(jsonStr) as ChatbotOrderData
  } catch {
    return null
  }
}

// ============================================================
// BUILD SYSTEM PROMPT
// Called once per conversation with store context
// ============================================================
const TONE_DESCRIPTIONS: Record<ChatbotTone, string> = {
  chaleureux:     'Chaleureux, amical et rassurant, comme un vendeur algérien accueillant.',
  professionnel:  'Professionnel, précis et courtois. Vouvoiement.',
  direct:         'Direct, efficace et concis. Va droit au but, sans bavardage.',
  amical:         'Amical et décontracté, proche du client, sympathique.',
}

export function buildSystemPrompt(
  storeName: string,
  products: Product[],
  settings?: { deliveryPrice?: number; welcomeMessage?: string; tone?: ChatbotTone; instructions?: string }
): string {
  const productList = products
    .filter(p => p.is_active)
    .map(p => {
      const options = []
      if (p.colors.length > 0) options.push(`Couleurs: ${p.colors.join(', ')}`)
      if (p.sizes.length > 0) options.push(`Tailles: ${p.sizes.join(', ')}`)
      return `- ${p.name} | Prix: ${p.price} DZD${options.length > 0 ? ` | ${options.join(' | ')}` : ''} | ID: ${p.id}`
    })
    .join('\n')

  const tone = settings?.tone ?? 'chaleureux'
  const instructionsBlock = settings?.instructions?.trim()
    ? `\nINSTRUCTIONS SUPPLÉMENTAIRES DU VENDEUR (à respecter en priorité):\n${settings.instructions.trim()}\n`
    : ''

  return `Tu es l'assistant virtuel de "${storeName}", une boutique en ligne algérienne.

LANGUE: Réponds en français ou en darija selon la langue du client. Adapte-toi automatiquement.

PERSONNALITÉ: ${TONE_DESCRIPTIONS[tone]}
${instructionsBlock}
PRODUITS DISPONIBLES:
${productList}

LIVRAISON: ${settings?.deliveryPrice ? `${settings.deliveryPrice} DZD` : 'Gratuite'}

TON RÔLE:
1. Répondre aux questions sur les produits
2. Aider le client à choisir
3. Prendre les commandes

PROCESSUS DE COMMANDE:
Quand un client veut commander, collecte ces informations DANS CET ORDRE:
1. Quel produit? (si pas encore précisé)
2. Quelle couleur/taille? (si disponible pour le produit)
3. Quelle quantité?
4. Prénom et nom complet
5. Numéro de téléphone (format algérien, 10 chiffres)
6. Wilaya
7. Commune

RÈGLE IMPORTANTE: Ne demande qu'UNE SEULE information à la fois.

QUAND TU AS TOUTES LES INFORMATIONS:
Confirme la commande au client avec un résumé, puis réponds EXACTEMENT avec cette ligne à la FIN de ton message:
${ORDER_READY_PREFIX}{"customer_name":"[nom]","customer_phone":"[téléphone]","wilaya":"[wilaya]","commune":"[commune]","quantity":[quantité],"color":"[couleur ou null]","size":"[taille ou null]","product_id":"[id du produit]","product_name":"[nom du produit]","unit_price":[prix]}

VALIDATION TÉLÉPHONE: Le numéro doit commencer par 05, 06, ou 07 et avoir 10 chiffres.

RÈGLES:
- Ne crée JAMAIS une commande sans avoir TOUTES les informations
- Ne confirme pas un numéro de téléphone invalide
- Reste toujours poli même si le client est impatient
- Si quelqu'un demande quelque chose hors sujet, redirige doucement vers les produits`
}

// ============================================================
// SEND CHATBOT MESSAGE
// ============================================================
interface ChatbotParams {
  storeName: string
  products: Product[]
  storeSettings?: { deliveryPrice?: number; welcomeMessage?: string; tone?: ChatbotTone; instructions?: string }
  conversationHistory: ChatMessage[]
  userMessage: string
}

export async function sendChatbotMessage({
  storeName,
  products,
  storeSettings,
  conversationHistory,
  userMessage,
}: ChatbotParams): Promise<string> {

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    systemInstruction: buildSystemPrompt(storeName, products, storeSettings),
  })

  // Convert history to Gemini format
  const history = conversationHistory.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }))

  const chat = model.startChat({ history })
  
  const result = await chat.sendMessage(userMessage)
  const response = result.response.text()
  
  return response
}

// ============================================================
// PHONE VALIDATION (Algerian format)
// ============================================================
export function isValidAlgerianPhone(phone: string): boolean {
  const cleaned = phone.replace(/\s/g, '')
  return /^(05|06|07)\d{8}$/.test(cleaned)
}

// ============================================================
// AD CREATIVE IMAGE GENERATION
// Uses gemini-3.1-flash-image-preview for image synthesis
// ============================================================
export interface AdCreativeInput {
  productName: string
  productDescription: string | null
  productPrice: number
  style: 'elegant' | 'energetic' | 'minimal'
  format: 'square' | 'story'
  adCopy: { headline: string; tagline: string }
}

export interface AdCreativeImageResult {
  imageBase64: string
  mimeType: string
}

const STYLE_DESCRIPTIONS = {
  elegant: 'luxurious dark background with gold accents, sophisticated and premium feel, high-end product showcase with dramatic lighting',
  energetic: 'bold vibrant warm colors, dynamic diagonal composition, high-contrast, eye-catching and punchy design',
  minimal: 'clean white or light grey background, product-centered, generous whitespace, modern and fresh look',
}

export async function generateAdCreativeImage(input: AdCreativeInput): Promise<AdCreativeImageResult> {
  const { productName, productPrice, style, format, adCopy } = input

  const formatDesc = format === 'story'
    ? 'vertical portrait 9:16 aspect ratio, tall format for TikTok and Instagram Stories'
    : 'square 1:1 aspect ratio for Instagram and Facebook feed posts'

  const prompt = `Create a professional social media advertisement image.

Format: ${formatDesc}
Visual style: ${STYLE_DESCRIPTIONS[style]}

Product being advertised: ${productName}
Price: ${productPrice.toLocaleString('fr-DZ')} DA

Text to include prominently on the image:
- Main headline (large bold text): "${adCopy.headline}"
- Tagline (smaller text below): "${adCopy.tagline}"
- Price badge (bottom corner): "${productPrice.toLocaleString('fr-DZ')} DA"

Requirements:
- Professional e-commerce advertisement quality
- Designed for the Algerian market
- French language text only
- No extra text beyond what is listed above
- Visually striking and conversion-focused
- High production value, looks like a paid ad`

  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' })

  // responseModalities is not yet in @google/generative-ai 0.24.x types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (model.generateContent as any)({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['image'] },
  })

  const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> =
    result?.response?.candidates?.[0]?.content?.parts ?? []

  const imagePart = parts.find(p => p.inlineData)
  if (!imagePart?.inlineData) {
    throw new Error('Gemini image generation returned no image data')
  }

  return {
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || 'image/png',
  }
}

// ============================================================
// PRODUCT SHOT GENERATION (image-to-image)
// Unlike generateAdCreativeImage (text-prompt-only), this feeds
// the merchant's product photo as input so Gemini produces a NEW
// scene of the SAME product instead of an unrelated image.
// ============================================================
export interface ProductShotInput {
  productImageBase64: string
  productImageMimeType: string   // 'image/jpeg' | 'image/png' | 'image/webp'
  productName: string
  scenePrompt: string            // from buildScenePrompt() in lib/landing-photos.ts
}

export interface ProductShotResult {
  imageBase64: string
  mimeType: string
}

export async function generateProductShot(input: ProductShotInput): Promise<ProductShotResult> {
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' })

  // responseModalities is not yet in @google/generative-ai 0.24.x types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (model.generateContent as any)({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { data: input.productImageBase64, mimeType: input.productImageMimeType } },
        { text: input.scenePrompt },
      ],
    }],
    generationConfig: { responseModalities: ['image'] },
  })

  const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> =
    result?.response?.candidates?.[0]?.content?.parts ?? []

  const imagePart = parts.find(p => p.inlineData)
  if (!imagePart?.inlineData) {
    throw new Error('Gemini n\'a retourné aucune image')
  }

  return {
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || 'image/png',
  }
}

// ============================================================
// COST ESTIMATES
// ============================================================
export function estimateImageGenerationCost(): { usd: number; dzd: number } {
  // Gemini Flash image generation: ~$0.04/image (estimate)
  const usd = 0.04
  return { usd, dzd: Math.round(usd * 260) }
}

export function estimateFullAdCreativeCost(): { usd: number; dzd: number } {
  // Claude copy (~500 input + 100 output tokens at Sonnet pricing $3/$15 per M)
  const claudeUsd = (500 / 1_000_000) * 3 + (100 / 1_000_000) * 15
  const { usd: imageUsd } = estimateImageGenerationCost()
  const totalUsd = claudeUsd + imageUsd
  return { usd: parseFloat(totalUsd.toFixed(4)), dzd: Math.round(totalUsd * 260) }
}

// ============================================================
// ESTIMATE GEMINI COST
// ============================================================
export function estimateGeminiCost(inputTokens: number, outputTokens: number) {
  // Gemini 2.5 Flash-Lite pricing
  const inputCostUSD = (inputTokens / 1_000_000) * 0.10
  const outputCostUSD = (outputTokens / 1_000_000) * 0.40
  const totalUSD = inputCostUSD + outputCostUSD
  const totalDZD = totalUSD * 260
  
  return {
    totalUSD: totalUSD.toFixed(5),
    totalDZD: totalDZD.toFixed(3),
  }
}
