// ============================================================
// Fraud Shield — adaptive per-store learning (v3).
//
// The enemy bot is not static: it rotates fingerprints, phones and IPs to
// evade detection. Static weights can't keep up. This module turns each
// store's OWN history — the merchant's confirmed_fake / confirmed_real
// decisions plus every stored order signal — into a live "threat profile"
// that the scorer uses to adapt its weights in real time.
//
// Learned facts are recomputed per order creation from the store's recent
// history, so the detector literally evolves: once the merchant confirms a
// batch of orders as fake, every later order reusing that bot's fingerprints,
// phones or IPs is hard-flagged (the "counter-attack"), while devices/phones
// proven real stop being penalized (returning customers are NOT fraud).
//
// This module is a pure function of the fetched history rows — no DB/network
// access — so it's fully unit-testable. The orders API route gathers the
// rows and feeds them in.
// ============================================================

/** A recent order of the store (as fetched by the orders route). */
export interface OrderHistoryRow {
  id: string
  created_at: string
  customer_phone: string | null
  customer_name: string | null
  fraud_label: string | null
  fraud_risk_score: number | null
}

/** A recent fraud_order_signals row of the store (as fetched by the route). */
export interface SignalHistoryRow {
  order_id: string
  device_fingerprint: string | null
  ip: string | null
  ip_country: string | null
  created_at: string
}

export interface Reputation {
  /** Orders tied to this entity the merchant confirmed as fake (or scored ≥ 60). */
  fake: number
  /** Orders tied to this entity the merchant confirmed as real. */
  real: number
  /** How many recent orders referenced this entity in total. */
  seen: number
}

export interface AdaptiveContext {
  /** Total recent orders considered (the learning window). */
  recentOrders: number
  /** Orders the merchant explicitly confirmed fake (fraud_label = 'confirmed_fake'). */
  confirmedFake: number
  /** Orders the merchant explicitly confirmed real (fraud_label = 'confirmed_real'). */
  confirmedReal: number
  /** High-risk orders (fraud_risk_score ≥ 60) in the window, whether confirmed or not. */
  highRiskRecent: number
  /** 0..1 share of the window that is confirmed/bot-scored fake. 0 until ≥ 3 orders. */
  botPressure: number
  fingerprintReputation: Record<string, Reputation>
  phoneReputation: Record<string, Reputation>
  ipReputation: Record<string, Reputation>
  /** Fingerprints observed on fake/confirmed-fake orders (the bot's device pool). */
  botFingerprints: Set<string>
  /** Normalized phones observed on fake/confirmed-fake orders (the bot's phone pool). */
  botPhones: Set<string>
  /** IPs observed on fake/confirmed-fake orders (the bot's source pool). */
  botIps: Set<string>
}

/** A store with no meaningful history yet. */
export const EMPTY_ADAPTIVE_CONTEXT: AdaptiveContext = {
  recentOrders: 0,
  confirmedFake: 0,
  confirmedReal: 0,
  highRiskRecent: 0,
  botPressure: 0,
  fingerprintReputation: {},
  phoneReputation: {},
  ipReputation: {},
  botFingerprints: new Set(),
  botPhones: new Set(),
  botIps: new Set(),
}

export function buildAdaptiveContext(
  orders: OrderHistoryRow[],
  signals: SignalHistoryRow[],
): AdaptiveContext {
  if (orders.length === 0) return EMPTY_ADAPTIVE_CONTEXT

  const ctx: AdaptiveContext = {
    recentOrders: orders.length,
    confirmedFake: 0,
    confirmedReal: 0,
    highRiskRecent: 0,
    botPressure: 0,
    fingerprintReputation: {},
    phoneReputation: {},
    ipReputation: {},
    botFingerprints: new Set(),
    botPhones: new Set(),
    botIps: new Set(),
  }

  const signalByOrder = new Map<string, SignalHistoryRow>()
  for (const s of signals) {
    if (!signalByOrder.has(s.order_id)) signalByOrder.set(s.order_id, s)
  }

  const MIN_WINDOW_FOR_PRESSURE = 3

  for (const o of orders) {
    const phone = normalizePhone(o.customer_phone)
    const fp = signalByOrder.get(o.id)?.device_fingerprint ?? null
    const ip = signalByOrder.get(o.id)?.ip ?? null
    const confirmedFake = o.fraud_label === 'confirmed_fake'
    const confirmedReal = o.fraud_label === 'confirmed_real'
    const highRisk = (o.fraud_risk_score ?? 0) >= 60

    if (confirmedFake) ctx.confirmedFake++
    if (confirmedReal) ctx.confirmedReal++
    if (highRisk) ctx.highRiskRecent++

    // We learn ONLY from merchant ground truth (confirmed_fake / confirmed_real).
    // An unconfirmed high-risk order is never treated as a bot — it may well be
    // one of OUR false positives, and feeding it back would make the detector
    // self-reinforce its mistakes. Once the merchant confirms a batch as fake,
    // every later order reusing its devices/phones/IPs is hard-flagged.
    if (fp) bump(ctx.fingerprintReputation, fp, confirmedFake, confirmedReal)
    if (phone) bump(ctx.phoneReputation, phone, confirmedFake, confirmedReal)
    if (ip) bump(ctx.ipReputation, ip, confirmedFake, confirmedReal)

    if (confirmedFake) {
      if (fp) ctx.botFingerprints.add(fp)
      if (phone) ctx.botPhones.add(phone)
      if (ip) ctx.botIps.add(ip)
    }
  }

  if (ctx.recentOrders >= MIN_WINDOW_FOR_PRESSURE) {
    ctx.botPressure = Math.min(1, ctx.confirmedFake / ctx.recentOrders)
  }

  return ctx
}

/** Reputation of the current order's device/phone inside the learned context. */
export interface EntityReputation {
  fingerprint: Reputation | null
  phone: Reputation | null
  isKnownBotDevice: boolean
}

export function reputationFor(
  ctx: AdaptiveContext,
  fingerprint: string | null,
  phone: string | null,
): EntityReputation {
  const normalizedPhone = normalizePhone(phone)
  return {
    fingerprint: fingerprint ? ctx.fingerprintReputation[fingerprint] ?? null : null,
    phone: normalizedPhone ? ctx.phoneReputation[normalizedPhone] ?? null : null,
    isKnownBotDevice:
      (!!fingerprint && ctx.botFingerprints.has(fingerprint)) ||
      (!!normalizedPhone && ctx.botPhones.has(normalizedPhone)),
  }
}

function bump(
  map: Record<string, Reputation>,
  key: string,
  fake: boolean,
  real: boolean,
): void {
  const cur = map[key] ?? { fake: 0, real: 0, seen: 0 }
  cur.seen++
  if (fake) cur.fake++
  else if (real) cur.real++
  map[key] = cur
}

/** Algerian mobile → canonical 10-digit form (05/06/07 + 8 digits), else null. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = String(raw).replace(/\D/g, '')
  if (digits.length >= 11 && digits.startsWith('213')) digits = digits.slice(3)
  if (digits.length === 9 && /^[567]/.test(digits)) digits = `0${digits}`
  return /^(05|06|07)\d{8}$/.test(digits) ? digits : null
}
