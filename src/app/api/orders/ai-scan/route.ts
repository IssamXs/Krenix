import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'
import { friendlyAIError } from '@/lib/ai-errors'
import {
  aiScanOrders,
  normalizeStoredResult,
  AI_MODEL,
  type AiScanResult,
  type AiScanOrder,
  type AiScanContextOrder,
  type StoredAiScanRow,
} from '@/lib/fraud-shield/ai-scan'
import { getFraudShieldStatus } from '@/lib/fraud-shield/status'

const MAX_ORDERS_PER_SCAN = 50
const MAX_CONTEXT = 30
// Reuse a cached verdict for 24h instead of paying for another Claude call.
const CACHE_TTL_MS = 24 * 3600 * 1000

// POST { ids: string[] } — the merchant selected one or more orders on the orders
// page and clicked "AI detection". Claude performs a full fake-order check on each
// selected order and returns verdicts. Read-only: nothing is written to orders here —
// the merchant then decides to archive / delete / keep the flagged orders themselves.
// Verdicts are cached in fraud_ai_scans for 24h so re-scans are instant and free.
//
// Gating is server-side: only stores with an ACTIVE paid Fraud Shield purchase AND
// the toggle enabled can scan. The rule-based signals (fraud_risk_score, signals)
// are included in the prompt as context so Claude can cross-check them.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { ids } = await request.json().catch(() => ({ ids: undefined }))
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Aucune commande sélectionnée' }, { status: 400 })
  }
  if (ids.length > MAX_ORDERS_PER_SCAN) {
    return NextResponse.json({ error: `Maximum ${MAX_ORDERS_PER_SCAN} commandes par analyse` }, { status: 400 })
  }
  const uniqueIds = [...new Set(ids as string[])]

  const admin = createAdminClient()

  // Ownership: only orders belonging to stores THIS user owns may be scanned.
  const { data: selected } = await admin.from('orders')
    .select('id, store_id')
    .in('id', uniqueIds)
  if (!selected || selected.length === 0) {
    return NextResponse.json({ error: 'Commandes introuvables' }, { status: 404 })
  }
  const storeIds = [...new Set(selected.map(o => o.store_id as string))]
  const { data: ownedStores } = await admin.from('stores')
    .select('id')
    .in('id', storeIds)
    .eq('owner_id', user.id)
  const ownedSet = new Set((ownedStores ?? []).map(s => s.id as string))
  if (storeIds.some(id => !ownedSet.has(id))) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  // Paid-feature gate: EVERY involved store must hold an active paid Fraud Shield
  // subscription with the toggle enabled.
  for (const storeId of storeIds) {
    const status = await getFraudShieldStatus(supabase, storeId)
    if (!status.canScan) {
      return NextResponse.json(
        { error: 'Fraud Shield inactif : activez votre abonnement pour utiliser le détecteur IA.', code: 'NOT_ACTIVE' },
        { status: 403 },
      )
    }
  }

  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()

  // Serve fresh cached verdicts first — no Claude call for orders already analyzed
  // within the TTL. Cached responses are cheap, so skip the per-IP rate limit.
  const { data: cachedRows } = await admin.from('fraud_ai_scans')
    .select('order_id, verdict, risk_score, reasons, summary, scanned_at')
    .in('order_id', uniqueIds)
  const cachedByOrderId = new Map<string, StoredAiScanRow>()
  for (const row of (cachedRows ?? []) as StoredAiScanRow[]) {
    if (nowMs - Date.parse(row.scanned_at) <= CACHE_TTL_MS) cachedByOrderId.set(row.order_id, row)
  }

  const needsScanIds = uniqueIds.filter(id => !cachedByOrderId.has(id))

  if (needsScanIds.length === 0) {
    const results = uniqueIds
      .map(id => cachedByOrderId.get(id))
      .filter((r): r is StoredAiScanRow => !!r)
      .map(normalizeStoredResult)
    return NextResponse.json({ results })
  }

  // One analysis per minute per IP — Claude calls are real money, so bound them.
  const allowed = await checkRateLimit(`ai-scan:${requestIp(request)}:${user.id}`, 5, 60)
  if (!allowed) {
    return NextResponse.json({ error: 'Trop d’analyses : réessayez dans une minute.', code: 'RATE_LIMITED' }, { status: 429 })
  }

  const { data: orders } = await admin.from('orders')
    .select('*, product:products(name), landing_page:landing_pages(title)')
    .in('id', needsScanIds)
  if (!orders) return NextResponse.json({ error: 'Erreur de chargement des commandes' }, { status: 500 })

  interface OrderRow {
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
    fraud_risk_score: number | null
    fraud_signals: Record<string, { points: number; detail: string }> | null
    product?: { name: string | null } | null
  }

  const orderRows = (orders ?? []) as OrderRow[]
  const scanOrders: AiScanOrder[] = orderRows.map(o => ({
    id: o.id,
    order_number: o.order_number,
    customer_name: o.customer_name,
    customer_phone: o.customer_phone,
    wilaya: o.wilaya,
    commune: o.commune,
    address: o.address,
    quantity: Number(o.quantity),
    unit_price: Number(o.unit_price),
    total_price: Number(o.total_price),
    delivery_type: o.delivery_type,
    status: o.status,
    source: o.source,
    notes: o.notes,
    created_at: o.created_at,
    product_name: o.product?.name ?? null,
    fraud_risk_score: o.fraud_risk_score ?? null,
    fraud_signals: o.fraud_signals ?? null,
  }))

  // Recent orders from the same store(s) give Claude the "repeated phone in a short
  // window" bot-detection context that a single order cannot provide.
  const { data: recent } = await admin.from('orders')
    .select('id, order_number, customer_name, customer_phone, wilaya, created_at')
    .in('store_id', storeIds)
    .neq('id', uniqueIds)
    .order('created_at', { ascending: false })
    .limit(MAX_CONTEXT)
  interface ContextRow {
    id: string
    order_number: string
    customer_name: string
    customer_phone: string
    wilaya: string
    created_at: string
  }
  const contextOrders: AiScanContextOrder[] = ((recent ?? []) as ContextRow[]).map(o => ({
    id: o.id,
    order_number: o.order_number,
    customer_name: o.customer_name,
    customer_phone: o.customer_phone,
    wilaya: o.wilaya,
    created_at: o.created_at,
  }))

  try {
    const scanned = await aiScanOrders(scanOrders, contextOrders)
    const freshResults: AiScanResult[] = scanned.map(r => ({
      ...r,
      cached: false,
      scannedAt: nowIso,
    }))

    // Persist fresh verdicts so the next scan of the same order is instant. This is
    // best-effort: a failed write must not break the response the merchant sees.
    const { error: upsertError } = await admin.from('fraud_ai_scans').upsert(
      freshResults.map(r => ({
        order_id: r.id,
        verdict: r.verdict,
        risk_score: r.riskScore,
        reasons: r.reasons,
        summary: r.summary,
        model: AI_MODEL,
        scanned_at: r.scannedAt,
      })),
    )
    if (upsertError) console.error('[orders/ai-scan] cache upsert failed:', upsertError)

    const freshById = new Map(freshResults.map(r => [r.id, r]))
    const results = uniqueIds
      .map(id => {
        const cached = cachedByOrderId.get(id)
        if (cached) return normalizeStoredResult(cached)
        return freshById.get(id)
      })
      .filter((r): r is AiScanResult => !!r)

    return NextResponse.json({ results })
  } catch (err) {
    console.error('[orders/ai-scan] error:', err)
    return NextResponse.json({ error: friendlyAIError(err) }, { status: 502 })
  }
}
