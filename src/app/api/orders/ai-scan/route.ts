import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'
import { friendlyAIError } from '@/lib/ai-errors'
import {
  aiScanOrdersBatched,
  normalizeStoredResult,
  AI_MODEL,
  SCAN_BATCH_SIZE,
  type AiScanResult,
  type AiScanOrder,
  type AiScanContextOrder,
  type AiScanIntelligence,
  type StoredAiScanRow,
} from '@/lib/fraud-shield/ai-scan'
import { buildAdaptiveContext, type OrderHistoryRow, type SignalHistoryRow } from '@/lib/fraud-shield/adaptive'
import { buildEngineContext, type EngineOrderRow, type EngineSignalRow } from '@/lib/fraud-shield/engine'
import { getFraudShieldStatus } from '@/lib/fraud-shield/status'
import { getScanQuotaStatus, logScanUsage } from '@/lib/fraud-shield/scan-quota'

// One scan request analyzes up to this many orders. Larger selections are NOT
// rejected: the route splits them into chunks of this size and scans each one,
// so "select all" works no matter how many orders the store has.
const MAX_ORDERS_PER_SCAN = 100
const MAX_CONTEXT = 30
// Reuse a cached verdict for 24h instead of paying for another Claude call.
const CACHE_TTL_MS = 24 * 3600 * 1000

// A scan of a large selection makes many sequential Claude calls, so give the
// function the full platform duration budget (Hobby max = Pro default = 300s).
export const maxDuration = 300

// POST { ids: string[] } — the merchant selected one or more orders on the orders
// page and clicked "AI detection". Claude performs a full fake-order check on each
// selected order and returns verdicts. Read-only: nothing is written to orders here —
// the merchant then decides to archive / delete / keep the flagged orders themselves.
// Verdicts are cached in fraud_ai_scans for 24h so re-scans are instant and free.
//
// Gating is server-side: only stores with an ACTIVE paid Fraud Shield purchase AND
// the toggle enabled can scan. The rule-based signals (fraud_risk_score, signals)
// are included in the prompt as context so Claude can cross-check them.
async function handleScan(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { ids, refresh } = await request.json().catch(() => ({ ids: undefined }))
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Aucune commande sélectionnée' }, { status: 400 })
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
  // An explicit `refresh` forces a new Claude pass (new model rules must re-judge
  // orders that were cached under older rules).
  const { data: cachedRows } = refresh
    ? { data: [] }
    : await admin.from('fraud_ai_scans')
        .select('order_id, verdict, risk_score, reasons, summary, scanned_at')
        .in('order_id', uniqueIds)
  const cachedByOrderId = new Map<string, StoredAiScanRow>()
  for (const row of (cachedRows ?? []) as StoredAiScanRow[]) {
    if (nowMs - Date.parse(row.scanned_at) <= CACHE_TTL_MS) cachedByOrderId.set(row.order_id, row)
  }

  const needsScanIds = uniqueIds.filter(id => !cachedByOrderId.has(id))

  // Monthly scan quota gate: only fresh (uncached) scans cost Claude money and
  // count against it. Block the whole request if any involved store lacks
  // enough remaining quota for its share of needsScanIds — same all-or-nothing
  // shape as the paid-feature gate above.
  const storeIdByOrderId = new Map(selected.map(o => [o.id as string, o.store_id as string]))
  const needsScanCountByStore = new Map<string, number>()
  for (const id of needsScanIds) {
    const sId = storeIdByOrderId.get(id)
    if (sId) needsScanCountByStore.set(sId, (needsScanCountByStore.get(sId) ?? 0) + 1)
  }
  for (const storeId of storeIds) {
    const neededForStore = needsScanCountByStore.get(storeId) ?? 0
    if (neededForStore === 0) continue
    const quota = await getScanQuotaStatus(supabase, storeId)
    if (quota && neededForStore > quota.remaining) {
      return NextResponse.json(
        {
          error: `Quota d'analyses IA atteint (${quota.used}/${quota.limit} ce mois-ci). Cette analyse en nécessite ${neededForStore} de plus.`,
          code: 'QUOTA_EXCEEDED',
        },
        { status: 403 },
      )
    }
  }

  // Claude calls are real money: bound them per minute, but a large selection
  // legitimately needs several batches, so size the budget to the workload
  // instead of 429ing every scan of more than ~10 orders.
  const neededCalls = Math.max(1, Math.ceil(needsScanIds.length / SCAN_BATCH_SIZE))
  const allowed = await checkRateLimit(`ai-scan:${requestIp(request)}:${user.id}`, Math.max(neededCalls, 10), 60)
  if (!allowed) {
    return NextResponse.json({ error: 'Trop d’analyses : réessayez dans une minute.', code: 'RATE_LIMITED' }, { status: 429 })
  }

  // Recent orders from the same store(s) give Claude the "repeated phone in a short
  // window" bot-detection context that a single order cannot provide.
  const { data: recent } = await admin.from('orders')
    .select('id, order_number, customer_name, customer_phone, notes, wilaya, created_at, fraud_label, fraud_risk_score')
    .in('store_id', storeIds)
    .neq('id', uniqueIds)
    .order('created_at', { ascending: false })
    .limit(MAX_CONTEXT)
  interface ContextRow {
    id: string
    order_number: string
    customer_name: string
    customer_phone: string
    notes: string | null
    wilaya: string
    created_at: string
    fraud_label: string | null
    fraud_risk_score: number | null
  }
  const contextRows = ((recent ?? []) as ContextRow[])
  const contextOrders: AiScanContextOrder[] = contextRows.map(o => ({
    id: o.id,
    order_number: o.order_number,
    customer_name: o.customer_name,
    customer_phone: o.customer_phone,
    wilaya: o.wilaya,
    created_at: o.created_at,
    fraud_label: o.fraud_label,
    device_fingerprint: null,
  }))

  // Learned intelligence: confirmed fake/real counts + bot device/phone pools
  // from the store's recent history. Only merchant ground truth teaches it, so
  // Claude is handed real evidence, never our own auto-scores.
  const recentIds = contextRows.map(o => o.id)
  const recentSignalsSelect = async (columns: string) => {
    const { data } = await admin.from('fraud_order_signals')
      .select(columns)
      .in('order_id', recentIds)
    return (data ?? []) as unknown as SignalHistoryRow[]
  }
  let recentSignals: SignalHistoryRow[] = []
  if (recentIds.length > 0) {
    try {
      recentSignals = await recentSignalsSelect(
        'order_id, device_fingerprint, ip, ip_country, created_at, form_fill_ms, had_movement, input_events, paste_events, avg_key_delay_ms, tab_hidden_ms',
      )
    } catch {
      recentSignals = await recentSignalsSelect('order_id, device_fingerprint, ip, ip_country, created_at')
    }
  }
  const adaptive = buildAdaptiveContext(
    contextRows as OrderHistoryRow[],
    recentSignals as SignalHistoryRow[],
  )
  // The evolving Engine: model of the bot's STRATEGY from the store's confirmed
  // history (behavior buckets, phone prefixes, hours), fed to Claude so it can
  // flag a new-identity wave that matches the learned profile.
  const engine = buildEngineContext(
    contextRows as EngineOrderRow[],
    recentSignals as EngineSignalRow[],
  )
  // Give the AI the fingerprint of each recent order too, so reuse across the
  // store's history is visible (not just confirmed-fake devices).
  const recentSignalFp = new Map(
    (recentSignals as SignalHistoryRow[]).map(s => [s.order_id, s.device_fingerprint]),
  )
  for (const c of contextOrders) {
    c.device_fingerprint = recentSignalFp.get(c.id) ?? null
  }
  const intelligence: AiScanIntelligence = {
    confirmedFake: adaptive.confirmedFake,
    confirmedReal: adaptive.confirmedReal,
    botPressure: adaptive.botPressure,
    botFingerprints: [...adaptive.botFingerprints],
    botPhones: [...adaptive.botPhones],
    engine,
  }

  interface OrderRow {
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
    fraud_label: string | null
    fraud_risk_score: number | null
    fraud_signals: Record<string, { points: number; detail: string }> | null
    product?: { name: string | null } | null
  }

  type ScanSignalRow = {
    order_id: string
    device_fingerprint: string | null
    ip: string | null
    time_on_page_ms: number | null
    had_movement: boolean | null
    form_fill_ms: number | null
    input_events?: number | null
    paste_events?: number | null
    avg_key_delay_ms?: number | null
    max_input_gap_ms?: number | null
    tab_hidden_ms?: number | null
    scroll_events?: number | null
    focus_events?: number | null
    ip_country: string | null
    ip_is_proxy_or_hosting: boolean | null
  }

  // Scan in chunks of MAX_ORDERS_PER_SCAN. "Select all" must work no matter how
  // many orders the store has — every chunk shares the store intelligence built
  // once above, and each chunk's verdicts are cached as it completes.
  //
  // The response is a NDJSON stream so the merchant sees REAL progress instead of
  // a fake bar that stalls at ~90% while a large selection is analysed: one
  // `progress` line per Claude batch (done = cached + freshly scanned so far),
  // then a single `result` line with the verdicts. Errors mid-stream are sent as
  // an `error` line; anything before the stream starts still returns a real JSON
  // status code.
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(payload) + '\n'))
      }
      const freshResults: AiScanResult[] = []
      // Orders already served from the 24h cache need no Claude call: count them
      // immediately so an all-cached selection resolves in the first frame.
      let scannedDone = cachedByOrderId.size
      try {
        send({ type: 'progress', done: scannedDone })

        for (let i = 0; i < needsScanIds.length; i += MAX_ORDERS_PER_SCAN) {
          const chunkIds = needsScanIds.slice(i, i + MAX_ORDERS_PER_SCAN)
          const { data: orders } = await admin.from('orders')
            .select('*, product:products(name), landing_page:landing_pages(title)')
            .in('id', chunkIds)
          if (!orders) throw new Error('Erreur de chargement des commandes')

          const orderRows = (orders ?? []) as OrderRow[]

          // Behavioral + IP signals captured at order time, so Claude can evaluate
          // fill time, mouse movement, autofill/paste, and origin against the store's
          // context. Extended columns (migration 051) fall back to the base set.
          const scanSignalSelect = async (columns: string) => {
            const { data } = await admin.from('fraud_order_signals')
              .select(columns)
              .in('order_id', chunkIds)
            return (data ?? []) as unknown as ScanSignalRow[]
          }
          let scanSignals: ScanSignalRow[] = []
          try {
            scanSignals = await scanSignalSelect(
              'order_id, device_fingerprint, ip, time_on_page_ms, had_movement, form_fill_ms, input_events, paste_events, avg_key_delay_ms, max_input_gap_ms, tab_hidden_ms, scroll_events, focus_events, ip_country, ip_is_proxy_or_hosting',
            )
          } catch {
            scanSignals = await scanSignalSelect(
              'order_id, device_fingerprint, time_on_page_ms, had_movement, form_fill_ms, ip_country, ip_is_proxy_or_hosting',
            )
          }
          const signalByOrder = new Map<string, ScanSignalRow>(scanSignals.map(s => [s.order_id, s]))
          const sig = (orderId: string): ScanSignalRow | undefined => signalByOrder.get(orderId)

          const scanOrders: AiScanOrder[] = orderRows.map(o => ({
            id: o.id,
            order_number: o.order_number,
            customer_name: o.customer_name,
            customer_phone: o.customer_phone,
            wilaya: o.wilaya,
            commune: o.commune,
            quantity: Number(o.quantity),
            unit_price: Number(o.unit_price),
            delivery_price: Number(o.delivery_price),
            total_price: Number(o.total_price),
            delivery_type: o.delivery_type,
            status: o.status,
            source: o.source,
            notes: o.notes,
            created_at: o.created_at,
            product_name: o.product?.name ?? null,
            fraud_label: o.fraud_label ?? null,
            device_fingerprint: sig(o.id)?.device_fingerprint ?? null,
            time_on_page_ms: sig(o.id)?.time_on_page_ms ?? null,
            had_movement: sig(o.id)?.had_movement ?? null,
            form_fill_ms: sig(o.id)?.form_fill_ms ?? null,
            input_events: sig(o.id)?.input_events ?? null,
            paste_events: sig(o.id)?.paste_events ?? null,
            avg_key_delay_ms: sig(o.id)?.avg_key_delay_ms ?? null,
            max_input_gap_ms: sig(o.id)?.max_input_gap_ms ?? null,
            tab_hidden_ms: sig(o.id)?.tab_hidden_ms ?? null,
            scroll_events: sig(o.id)?.scroll_events ?? null,
            focus_events: sig(o.id)?.focus_events ?? null,
            ip: sig(o.id)?.ip ?? null,
            ip_country: sig(o.id)?.ip_country ?? null,
            ip_is_proxy_or_hosting: sig(o.id)?.ip_is_proxy_or_hosting ?? null,
            fraud_risk_score: o.fraud_risk_score ?? null,
            fraud_signals: o.fraud_signals ?? null,
          }))

          const scanned = await aiScanOrdersBatched(
            scanOrders, contextOrders, intelligence, SCAN_BATCH_SIZE,
            (completed) => {
              send({ type: 'progress', done: scannedDone + completed })
            },
          )
          scannedDone += chunkIds.length
          const chunkResults: AiScanResult[] = scanned.map(r => ({
            ...r,
            cached: false,
            scannedAt: nowIso,
          }))
          freshResults.push(...chunkResults)

          // Persist fresh verdicts so the next scan of the same order is instant. This is
          // best-effort: a failed write must not break the response the merchant sees.
          const { error: upsertError } = await admin.from('fraud_ai_scans').upsert(
            chunkResults.map(r => ({
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

          // Log usage against the monthly quota — one row per order actually
          // sent to Claude in this chunk, grouped by the store it belongs to.
          const chunkIdsByStore = new Map<string, string[]>()
          for (const id of chunkIds) {
            const sId = storeIdByOrderId.get(id)
            if (!sId) continue
            const list = chunkIdsByStore.get(sId) ?? []
            list.push(id)
            chunkIdsByStore.set(sId, list)
          }
          for (const [sId, ids] of chunkIdsByStore) {
            await logScanUsage(admin, sId, ids)
          }
        }

        const freshById = new Map(freshResults.map(r => [r.id, r]))
        const results = uniqueIds
          .map(id => {
            const cached = cachedByOrderId.get(id)
            if (cached) return normalizeStoredResult(cached)
            return freshById.get(id)
          })
          .filter((r): r is AiScanResult => !!r)

        send({ type: 'result', results })
      } catch (err) {
        console.error('[orders/ai-scan] error:', err)
        send({ type: 'error', message: friendlyAIError(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}

export async function POST(request: Request) {
  try {
    return await handleScan(request)
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
