// ============================================================
// KRENIX — AI fake-orders detector (Claude)
// Used by /api/orders/ai-scan — the merchant selects one or more orders on the
// orders page and clicks "AI detection"; Claude performs a full fraud check on
// each selected order and returns a verdict + explainable reasons.
//
// The scan is a PAID Fraud Shield feature (gated server-side by the route);
// this module only talks to the AI provider.
// ============================================================

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export const AI_MODEL = 'claude-sonnet-4-6'

export type AiVerdict = 'fake' | 'real' | 'suspicious'

export interface AiScanResult {
  id: string
  verdict: AiVerdict
  riskScore: number
  reasons: string[]
  summary: string
  /** True when the verdict was served from the cache, not a fresh Claude call. */
  cached?: boolean
  /** ISO timestamp of when this verdict was produced. */
  scannedAt?: string
}

export interface AiScanOrder {
  id: string
  order_number: string
  customer_name: string
  customer_phone: string
  wilaya: string
  commune: string
  address: string | null
  quantity: number
  unit_price: number
  total_price: number
  delivery_type: 'home' | 'desk'
  status: string
  source: string
  notes: string | null
  created_at: string
  product_name: string | null
  /** Rule-based score 0-100 computed at order creation (see fraud-shield/score). */
  fraud_risk_score: number | null
  /** Rule-based signals that fired at order creation, keyed by signal name. */
  fraud_signals: Record<string, { points: number; detail: string }> | null
}

/** A row of the fraud_ai_scans cache table. */
export interface StoredAiScanRow {
  order_id: string
  verdict: string
  risk_score: number
  reasons: unknown[] | null
  summary: string | null
  scanned_at: string
}

export interface AiScanContextOrder {
  id: string
  order_number: string
  customer_name: string
  customer_phone: string
  wilaya: string
  created_at: string
}

const VERDICT_OPTIONS = 'fake | real | suspicious'

function sanitize(s: string | null | undefined, max = 60): string {
  const v = String(s ?? '').replace(/[\r\n]+/g, ' ').trim()
  return v.length > max ? `${v.slice(0, max)}…` : v
}

function formatAutomaticSignals(
  riskScore: number | null,
  signals: AiScanOrder['fraud_signals'],
): string {
  if (riskScore == null) return 'aucun'
  const details = Object.values(signals ?? {})
    .map(s => s.detail)
    .join(' ; ')
  return sanitize(`score ${riskScore}/100${details ? ` — ${details}` : ''}`, 250)
}

function buildPrompt(orders: AiScanOrder[], context: AiScanContextOrder[]): string {
  const orderBlock = orders.map((o, i) =>
    `- Order ${i + 1} (id: ${o.id})\n` +
    `  number: ${sanitize(o.order_number)}\n` +
    `  date: ${o.created_at}\n` +
    `  name: ${sanitize(o.customer_name)}\n` +
    `  phone: ${sanitize(o.customer_phone, 30)}\n` +
    `  wilaya/commune: ${sanitize(o.wilaya, 30)} / ${sanitize(o.commune, 30)}\n` +
    `  address: ${sanitize(o.address, 80) || 'vide'}\n` +
    `  product: ${sanitize(o.product_name, 60)}\n` +
    `  qty: ${o.quantity} | unit: ${o.unit_price} DZD | total: ${o.total_price} DZD\n` +
    `  delivery: ${o.delivery_type} | status: ${o.status} | source: ${o.source}\n` +
    `  note: ${sanitize(o.notes, 100) || 'aucune'}\n` +
    `  signaux auto: ${formatAutomaticSignals(o.fraud_risk_score, o.fraud_signals)}`
  ).join('\n')

  const contextBlock = context.length
    ? context.map(c =>
        `- ${c.created_at} | ${sanitize(c.customer_name, 30)} | ${sanitize(c.customer_phone, 30)} | ${sanitize(c.wilaya, 25)} | ${sanitize(c.order_number, 20)}`
      ).join('\n')
    : '(aucune)'

  return `Analyse ${orders.length} commande(s) e-commerce algérienne(s) au paiement à la livraison.

COMMANDES À ANALYSER:
${orderBlock}

CONTEXTE — les ${context.length} dernières commandes de la boutique (pour repérer téléphones/noms répétés et rythme anormal):
${contextBlock}

DÉTECTION DE FAUSSES COMMANDES — signaux typiques:
1. Téléphone invalide ou impossible (pas au format algérien 05/06/07 suivi de 8 chiffres), ou préfixe sans rapport avec la wilaya.
2. Nom incohérent (ex: "test", "aa", "zzz", noms de villes, mots uniques bizarres).
3. Commune inexistante ou incompatible avec la wilaya déclarée.
4. Note bizarre (lien, script, caractères répétés, "test", spam).
5. Quantité anormale (0, négative, déraisonnablement élevée) ou prix total incohérent avec quantité × prix unitaire.
6. Adresse vide ou absurde.
7. Le même téléphone ou nom revient plusieurs fois en très peu de temps (probable bot).
8. Intervalle de temps anormalement régulier entre plusieurs commandes (bot automatisé).
9. Commande passée depuis une source/statut inhabituel.
10. Signaux automatiques fournis pour chaque commande (score 0-100 + détails) : un score élevé (≥ 60) doit être confirmé par ton analyse, ou explicitement réfuté avec une justification.

RÈGLES:
- Sois prudent : un signal faible → "suspicious", pas "fake". "fake" exige plusieurs signaux concordants.
- Le format téléphonique algérien valide est 05, 06 ou 07 suivi de 8 chiffres.
- "real" quand aucun signal significatif n'est trouvé.
- riskScore = probabilité estimée que la commande soit fausse (0-100).

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ou après, sans markdown, exactement au format:
{
  "orders": [
    {
      "id": "<id de la commande>",
      "verdict": ${VERDICT_OPTIONS},
      "riskScore": <entier 0-100>,
      "reasons": ["<raison concise en français>", "<autre raison>"],
      "summary": "<une phrase courte en français résumant la décision>"
    }
  ]
}

Une entrée par commande analysée, toujours avec le bon "id".`
}

export function parseResponse(text: string, orders: AiScanOrder[]): AiScanResult[] {
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(clean) as { orders?: AiScanResult[] }
  const byId = new Map(orders.map(o => [o.id, o]))
  const results = (parsed.orders ?? [])
    .filter(r => r && byId.has(r.id))
    .map(r => ({
      id: r.id,
      verdict: (['fake', 'real', 'suspicious'] as const).includes(r.verdict) ? r.verdict : 'suspicious',
      riskScore: Math.max(0, Math.min(100, Number(r.riskScore) || 0)),
      reasons: Array.isArray(r.reasons) ? r.reasons.map(String) : [],
      summary: typeof r.summary === 'string' ? r.summary : '',
    }))
  // Never silently drop a scanned order from the response — fill any missing one.
  for (const o of orders) {
    if (!results.some(r => r.id === o.id)) {
      results.push({ id: o.id, verdict: 'suspicious', riskScore: 30, reasons: ['Analyse IA incomplète'], summary: 'Réponse IA partielle — commande conservée comme suspecte.' })
    }
  }
  return results
}

/**
 * Turn a fraud_ai_scans cache row back into an AiScanResult, applying the same
 * normalization as parseResponse so cached and fresh results behave alike.
 */
export function normalizeStoredResult(row: StoredAiScanRow): AiScanResult {
  return {
    id: row.order_id,
    verdict: (['fake', 'real', 'suspicious'] as const).includes(row.verdict as AiVerdict)
      ? (row.verdict as AiVerdict)
      : 'suspicious',
    riskScore: Math.max(0, Math.min(100, Number(row.risk_score) || 0)),
    reasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [],
    summary: typeof row.summary === 'string' ? row.summary : '',
    cached: true,
    scannedAt: row.scanned_at,
  }
}

export async function aiScanOrders(
  orders: AiScanOrder[],
  context: AiScanContextOrder[],
): Promise<AiScanResult[]> {
  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 4000,
    temperature: 0.2,
    system: `Tu es un expert en détection de fraude pour le e-commerce au paiement à la livraison en Algérie.`,
    messages: [{ role: 'user', content: buildPrompt(orders, context) }],
  })
  const textBlock = response.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('Pas de réponse texte de Claude')
  return parseResponse(textBlock.text, orders)
}
