// ============================================================
// KRENIX — AI fake-orders detector (Claude)
// Used by /api/orders/ai-scan — the merchant selects one or more orders on the
// orders page and clicks "AI detection"; Claude performs a full fraud check on
// each selected order and returns a verdict + explainable reasons.
//
// The scan is a PAID Fraud Shield feature (gated server-side by the route);
// this module only talks to the AI provider.
//
// v3: precision first. Claude is told that a first-name-only customer is
// NORMAL (never flag a missing last name), and it receives the store's learned
// intelligence (confirmed fake/real feedback + known bot devices/phones) as
// ground truth to weigh. Large selections are scanned in small batches so a
// single truncation or hiccup never poisons the whole run.
//
// v4: anti-surface-realism. Claude is told that a polite note, stop-desk,
// valid phone, correct commune or quantity > 1 prove NOTHING (a smart bot
// imitates all of it), and it receives an automatically computed cadence +
// device/phone reuse block so a multi-order bot wave is visible instead of
// each order looking "human" in isolation.
// ============================================================

import Anthropic from '@anthropic-ai/sdk'
import { buildEngineIntelligenceBlock } from './engine'

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
  quantity: number
  unit_price: number
  delivery_price: number
  total_price: number
  delivery_type: 'home' | 'desk'
  status: string
  source: string
  notes: string | null
  created_at: string
  product_name: string | null
  /** Merchant feedback on this order, if the merchant already reviewed it. */
  fraud_label: string | null
  /** Device fingerprint captured at order time (for bot-cluster matching). */
  device_fingerprint?: string | null
  /** Rule-based score 0-100 computed at order creation (see fraud-shield/score). */
  fraud_risk_score: number | null
  /** Rule-based signals that fired at order creation, keyed by signal name. */
  fraud_signals: Record<string, { points: number; detail: string }> | null
  /** Behavioral signals captured on the storefront (see fraud-shield/client-signals). */
  time_on_page_ms?: number | null
  had_movement?: boolean | null
  form_fill_ms?: number | null
  input_events?: number | null
  paste_events?: number | null
  avg_key_delay_ms?: number | null
  max_input_gap_ms?: number | null
  tab_hidden_ms?: number | null
  scroll_events?: number | null
  focus_events?: number | null
  /** IP country + proxy/hosting flag captured at order time (see fraud-shield/ip-intel). */
  ip?: string | null
  ip_country?: string | null
  ip_is_proxy_or_hosting?: boolean | null
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
  fraud_label: string | null
  /** Device fingerprint of this recent order, to spot reuse across the store. */
  device_fingerprint?: string | null
}

/** Learned intelligence the store gathered about its own fraudsters. */
export interface AiScanIntelligence {
  confirmedFake: number
  confirmedReal: number
  botPressure: number
  botFingerprints: string[]
  botPhones: string[]
  /** The evolving Engine's learned model for this store (see engine.ts). */
  engine?: import('./engine').EngineContext
}

const VERDICT_OPTIONS = 'fake | real | suspicious'
// Large selections are analyzed in small batches so the JSON output always
// fits comfortably inside the token budget — no truncation, no dropped orders.
export const SCAN_BATCH_SIZE = 10

function sanitize(s: string | null | undefined, max = 60): string {
  const v = String(s ?? '').replace(/[\r\n]+/g, ' ').trim()
  return v.length > max ? `${v.slice(0, max)}…` : v
}

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '?'
  return ms >= 1000 ? `${Math.round(ms / 1000)}s` : `${ms}ms`
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

// A bot wave is invisible inside a single order: 50 "perfect" orders in an hour
// from rotating phones/fingerprints look human one-by-one. This surfaces the
// cadence + device/phone reuse the AI could not otherwise see, so "real" becomes
// much harder to justify mid-attack.
function buildCadenceBlock(orders: AiScanOrder[], context: AiScanContextOrder[]): string {
  const all = [
    ...context.map(c => ({ ts: new Date(c.created_at).getTime(), phone: c.customer_phone, fp: c.device_fingerprint ?? null, ip: null as string | null })),
    ...orders.map(o => ({ ts: new Date(o.created_at).getTime(), phone: o.customer_phone, fp: o.device_fingerprint ?? null, ip: o.ip ?? null })),
  ].filter(x => !Number.isNaN(x.ts)).sort((a, b) => a.ts - b.ts)

  if (all.length < 3) return ''

  const now = Date.now()
  const lastHour = all.filter(x => now - x.ts <= 3600_000)
  const last6h = all.filter(x => now - x.ts <= 6 * 3600_000)

  const parts: string[] = []
  if (lastHour.length >= 6) {
    parts.push(`RAFALE: ${lastHour.length} commandes enregistrées dans la dernière heure`)
  } else if (last6h.length >= 12) {
    parts.push(`Volume élevé: ${last6h.length} commandes dans les 6 dernières heures`)
  }

  const fpCount = new Map<string, number>()
  const phoneCount = new Map<string, number>()
  const ipCount = new Map<string, number>()
  for (const x of all) {
    if (x.fp) fpCount.set(x.fp, (fpCount.get(x.fp) ?? 0) + 1)
    phoneCount.set(x.phone, (phoneCount.get(x.phone) ?? 0) + 1)
    if (x.ip) ipCount.set(x.ip, (ipCount.get(x.ip) ?? 0) + 1)
  }
  const repeatedFp = [...fpCount.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const repeatedPhones = [...phoneCount.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const repeatedIps = [...ipCount.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 3)

  const reuse: string[] = []
  if (repeatedFp.length) reuse.push(`empreintes réutilisées: ${repeatedFp.map(([fp, n]) => `${fp.slice(0, 8)}… (x${n})`).join(', ')}`)
  if (repeatedPhones.length) reuse.push(`téléphones réutilisés: ${repeatedPhones.map(([p, n]) => `${p} (x${n})`).join(', ')}`)
  if (repeatedIps.length) reuse.push(`IP réutilisées: ${repeatedIps.map(([ip, n]) => `${ip} (x${n})`).join(', ')}`)
  if (reuse.length) parts.push(reuse.join(' — '))

  return parts.length ? parts.join(' | ') : ''
}

export function buildPrompt(
  orders: AiScanOrder[],
  context: AiScanContextOrder[],
  intelligence?: AiScanIntelligence,
): string {
  const orderBlock = orders.map((o, i) =>
    `- Order ${i + 1} (id: ${o.id})\n` +
    `  number: ${sanitize(o.order_number)}\n` +
    `  date: ${o.created_at}\n` +
    `  name: ${sanitize(o.customer_name)}\n` +
    `  phone: ${sanitize(o.customer_phone, 30)}\n` +
    `  wilaya/commune: ${sanitize(o.wilaya, 30)} / ${sanitize(o.commune, 30)}\n` +
    `  product: ${sanitize(o.product_name, 60)}\n` +
    `  qty: ${o.quantity} | unit: ${o.unit_price} DZD | delivery: ${o.delivery_price} DZD | total: ${o.total_price} DZD\n` +
    `  delivery_type: ${o.delivery_type} | status: ${o.status} | source: ${o.source}\n` +
    `  note: ${sanitize(o.notes, 100) || 'aucune'}\n` +
    `  empreinte: ${sanitize(o.device_fingerprint, 40) || 'inconnue'}\n` +
    `  comportement: page ${fmtMs(o.time_on_page_ms)} | remplissage ${fmtMs(o.form_fill_ms)} | souris ${o.had_movement ? 'oui' : 'non'} | saisie ${o.input_events ?? '?'} | collage ${o.paste_events ?? '?'} | cadence ${fmtMs(o.avg_key_delay_ms)} | onglet caché ${fmtMs(o.tab_hidden_ms)}\n` +
    `  ip: ${o.ip_country ?? '?'}${o.ip_is_proxy_or_hosting ? ' (proxy/VPN/datacenter)' : ''}\n` +
    `  label marchand: ${o.fraud_label ?? 'pending'}\n` +
    `  signaux auto: ${formatAutomaticSignals(o.fraud_risk_score, o.fraud_signals)}`
  ).join('\n')

  const contextBlock = context.length
    ? context.map(c =>
        `- ${c.created_at} | ${sanitize(c.customer_name, 30)} | ${sanitize(c.customer_phone, 30)} | ${sanitize(c.wilaya, 25)} | ${sanitize(c.order_number, 20)} | empreinte: ${sanitize(c.device_fingerprint, 12) || '?'}${c.fraud_label && c.fraud_label !== 'pending' ? ` | ${c.fraud_label}` : ''}`
      ).join('\n')
    : '(aucune)'

  const cadenceBlock = buildCadenceBlock(orders, context)
  const engineBlock = intelligence?.engine
    ? buildEngineIntelligenceBlock(intelligence.engine)
    : '(boutique sans modèle appris)'

  const intelBlock = intelligence && intelligence.confirmedFake > 0
    ? `- Commandes confirmées FAUSSES par le marchand: ${intelligence.confirmedFake} — confirmées RÉELLES: ${intelligence.confirmedReal}\n` +
      `- Pression bot (part confirmée fausse récemment): ${Math.round(intelligence.botPressure * 100)}%\n` +
      `- Empreintes (appareils) liées à des fausses commandes confirmées: ${intelligence.botFingerprints.length ? intelligence.botFingerprints.join(', ') : '(aucune)'}\n` +
      `- Téléphones liés à des fausses commandes confirmées: ${intelligence.botPhones.length ? intelligence.botPhones.join(', ') : '(aucun)'}`
    : '(aucun — pas encore de fausse commande confirmée dans cette boutique)'

  return `Analyse ${orders.length} commande(s) e-commerce algérienne(s) au paiement à la livraison.

COMMANDES À ANALYSER:
${orderBlock}

INTELLIGENCE — vérité terrain apprise par la boutique (retours marchand):
${intelBlock}
Si une commande à analyser porte une empreinte ou un téléphone de cette liste, c'est un signal FORT de fraude.

MOTEUR DE DÉTECTION — modèle appris par le moteur anti-fraude sur CETTE boutique (statistiques issues des seules commandes confirmées par le marchand):
${engineBlock}
Ce modèle évolue à chaque confirmation marchand : il décrit la STRATÉGIE du bot (comportement, préfixes, heures), pas seulement son identité. Une commande qui correspond au modèle appris est suspecte même si son téléphone/empreinte/IP n'ont jamais été vus.

CONTEXTE — les ${context.length} dernières commandes de la boutique (pour repérer téléphones/noms/empreintes répétés et rythme anormal):
${contextBlock}

CADENCE & RÉUTILISATION — détectées automatiquement à partir de toutes les commandes récentes (incluant celles à analyser):
${cadenceBlock || '(rythme normal, aucune réutilisation d\'empreinte, de téléphone ou d\'IP détectée)'}

DÉTECTION DE FAUSSES COMMANDES — signaux typiques:
1. Téléphone invalide ou impossible (pas au format algérien 05/06/07 suivi de 8 chiffres), ou préfixe sans rapport avec la wilaya.
2. Nom incohérent : "test", "aa", "zzz", noms de villes, caractères en série. ATTENTION : un prénom seul (ex: "Amira") ou un nom sans prénom est COURANT en Algérie — ce n'est JAMAIS un signal de fraude en soi.
3. Commune inexistante ou incompatible avec la wilaya déclarée. ATTENTION : la commune vient d'un MENU DÉROULANT lié à la wilaya choisie par le client — une commune valide et cohérente avec la wilaya est donc ATTENDUE dans 100% des cas et ne prouve NI l'authenticité NI la fraude. Ne cite jamais « commune valide pour cette wilaya » comme raison de ta décision.
4. Note bizarre (lien, script, caractères répétés, "test", spam). ATTENTION : une note absente OU polie est NEUTRE — ce n'est ni un signe de fraude, ni une preuve d'authenticité.
5. Quantité anormale (0, négative, déraisonnablement élevée) ou prix total incohérent. RAPPEL : le total = quantité × prix unitaire + frais de livraison (ex : 1600 DZD + 500 DZD de livraison = 2100 DZD — c'est COHÉRENT, pas une anomalie).
6. Le même téléphone avec des identités différentes en très peu de temps (probable bot).
7. Intervalle de temps anormalement régulier entre plusieurs commandes (bot automatisé).
8. Commande passée depuis une source/statut inhabituel.
9. Signaux automatiques fournis pour chaque commande (score 0-100 + détails) : un score élevé (≥ 60) doit être confirmé par ton analyse, ou explicitement réfuté avec une justification.
10. L'empreinte ou le téléphone figure dans la liste INTELLIGENCE → fraude très probable.
11. Une empreinte ou un téléphone apparaît dans "CADENCE & RÉUTILISATION" (réutilisé sur plusieurs commandes récentes) → bot ou personne réutilisant le même appareil de façon anormale.
12. Une "RAFALE" est signalée : un afflux anormal de commandes en peu de temps est LA signature d'un bot qui change d'identité à chaque commande.
13. Comportement de remplissage (fourni pour chaque commande) : formulaire rempli en < 1 seconde SANS aucun mouvement de souris = autofill de bot. Remplissage + temps sur page de seulement 2-3 secondes sur une commande complète = suspect. Des dizaines de secondes avec mouvement souris = neutre (ni preuve, ni exonération).
14. IP (fournie pour chaque commande) : IP d'un pays étranger, ou proxy/VPN/datacenter, pour une commande algérienne au paiement à la livraison = suspect. Des dizaines de commandes depuis la MÊME IP est aussi un signal fort.
15. AUTOFILL (fourni par le navigateur) : collage sur 2+ champs (« collage ») avec une cadence de frappe impossiblement rapide (« cadence » < 40-100 ms), ou un formulaire rempli en < 2 s avec très peu de saisie (« saisie ») et aucun mouvement → autofill de bot. Un humain tape à ~100-500 ms par touche et n'autofill pas 2+ champs.
16. MODÈLE APPRIS (section MOTEUR DE DÉTECTION) : si la commande correspond à une stratégie de bot apprise sur cette boutique (même comportement, mêmes préfixes, même heure…), c'est suspect même si téléphone/empreinte/IP sont nouveaux.

RÈGLES:
- Sois prudent : un signal faible → "suspicious", pas "fake". "fake" exige plusieurs signaux concordants.
- Le format téléphonique algérien valide est 05, 06 ou 07 suivi de 8 chiffres.
- ⚠️ L'APPEARANCE NE PROUVE RIEN : une note polie, un stop-desk, un téléphone valide, une commune correcte (menu déroulant), une quantité > 1 ou un nom complet sont TRIVIALEMENT imitables par un bot. Ce ne sont JAMAIS des preuves d'authenticité et ils ne doivent jamais être cités comme raison de dire "real".
- Utilise le comportement fourni (temps sur page, temps de remplissage, mouvement souris, saisie, collage, cadence, onglet caché) et l'IP dans ton raisonnement : un remplissage ultra-rapide sans mouvement, du collage à cadence impossible, un onglet caché pendant le remplissage, ou une IP étrangère/proxy renforce le doute même si le reste de la commande est impeccable.
- Le MODÈLE APPRIS est la mémoire du moteur : si la commande correspond à une stratégie de bot confirmée sur cette boutique, "real" exige une justification qui EXPLIQUE pourquoi cette commande diffère du bot appris. Le modèle appris a toujours préséance sur l'apparence.
- Si une RAFALE ou une réutilisation d'empreinte/téléphone/IP est signalée ci-dessus, chaque commande concernée est suspecte par défaut : "real" exige alors une justification SOLIDE, spécifique et individualisée pour cette commande.
- "real" quand aucun signal significatif n'est trouvé ET que le contexte ne révèle ni rafale ni réutilisation.
- Le formulaire de commande NE collecte PAS d'adresse. Une adresse absente est donc NORMALE et ne doit JAMAIS être un signal de fraude.
- Pour vérifier le prix, calcule : quantité × prix unitaire + frais de livraison. Un écart correspondant exactement aux frais de livraison est normal.
- Le label marchand est la vérité terrain : une commande déjà "confirmed_real" ne doit pas être inversée sans preuve très forte, une "confirmed_fake" ne doit pas être blanchie.
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
  intelligence?: AiScanIntelligence,
): Promise<AiScanResult[]> {
  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 8000,
    temperature: 0.2,
    system: `Tu es un expert en détection de fraude pour le e-commerce au paiement à la livraison en Algérie.`,
    messages: [{ role: 'user', content: buildPrompt(orders, context, intelligence) }],
  })
  const textBlock = response.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('Pas de réponse texte de Claude')
  return parseResponse(textBlock.text, orders)
}

/**
 * Scan many orders in small batches. A single large request risks hitting the
 * output-token ceiling or dropping orders mid-JSON; batching keeps each response
 * small, and one failing batch degrades to "suspicious" instead of failing the
 * whole selection.
 */
export async function aiScanOrdersBatched(
  orders: AiScanOrder[],
  context: AiScanContextOrder[],
  intelligence?: AiScanIntelligence,
  batchSize: number = SCAN_BATCH_SIZE,
  onProgress?: (completed: number) => void,
): Promise<AiScanResult[]> {
  const results: AiScanResult[] = []
  for (let i = 0; i < orders.length; i += batchSize) {
    const chunk = orders.slice(i, i + batchSize)
    try {
      results.push(...(await aiScanOrders(chunk, context, intelligence)))
    } catch (err) {
      console.error('[orders/ai-scan] batch failed:', err)
      for (const o of chunk) {
        results.push({
          id: o.id,
          verdict: 'suspicious',
          riskScore: 30,
          reasons: ['Analyse IA interrompue pour ce lot'],
          summary: 'Erreur sur ce lot — commande conservée comme suspecte.',
        })
      }
    }
    onProgress?.(Math.min(orders.length, i + chunk.length))
  }
  return results
}
