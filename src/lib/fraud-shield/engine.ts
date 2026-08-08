// ============================================================
// KRENIX — Fraud Engine (the "AI brain" that evolves).
//
// The enemy bot is not static: it rotates phones, fingerprints and IPs, and
// it re-tunes its surface realism (notes, stop-desk, valid communes) every
// time we add a rule. Identity pools become useless the moment the bot rotates
// them — a new wave carries brand-new phones/devices that appear in no pool.
//
// The Engine learns WHAT THE BOT DOES, not WHO it is. It turns each store's own
// confirmed history into a live statistical model:
//
//   1. FEATURE EXTRACTION — every order is reduced to a small vector of
//      discrete "buckets": fill speed, keystroke cadence, paste usage, note
//      style, phone prefix, name shape, order hour, device/phone/IP sharing,
//      movement. Buckets are stable and sparse-data friendly.
//
//   2. LEARNED MODEL — for every feature value we count how often it appeared
//      on merchant-confirmed FAKE vs REAL orders, giving a fake-share
//      likelihood per value. This is learned ONLY from merchant ground truth
//      (fraud_label), never from our own verdicts — no self-reinforcement.
//
//   3. ATTACK PROFILES — confirmed-fake orders are clustered by their shared
//      signature (the feature values most distinctive of the bot). The result
//      is a set of "strategies the enemy used here": e.g. "fast autofill +
//      heavy paste + short notes + prefixes 054/077". A NEW order that matches
//      a stored profile is flagged EVEN IF its phone/fingerprint/IP have never
//      been seen — because the bot's strategy, not its identity, is what
//      repeats across waves.
//
//   4. MATCHING — a new order is scored against every stored profile; the best
//      match above threshold becomes the attack_profile_match signal.
//
// Everything is a pure function of the fetched history rows (no DB/network
// access), fully unit-testable, and recomputed per order/scan so the detector
// literally evolves in real time the moment the merchant confirms a wave.
// ============================================================

import { normalizePhone } from './adaptive'

/** A recent order row of the store (as fetched by the orders/ai-scan routes). */
export interface EngineOrderRow {
  id: string
  created_at: string
  customer_phone: string | null
  customer_name: string | null
  notes?: string | null
  fraud_label: string | null
  fraud_risk_score: number | null
}

/** A recent fraud_order_signals row of the store (extended columns optional). */
export interface EngineSignalRow {
  order_id: string
  device_fingerprint: string | null
  ip: string | null
  ip_country: string | null
  time_on_page_ms?: number | null
  form_fill_ms?: number | null
  had_movement?: boolean | null
  input_events?: number | null
  paste_events?: number | null
  avg_key_delay_ms?: number | null
  max_input_gap_ms?: number | null
  tab_hidden_ms?: number | null
  scroll_events?: number | null
  focus_events?: number | null
}

/** One discrete feature value of an order, e.g. fill_speed='instant'. */
export interface BehaviorFeatures {
  fill_speed: string
  key_cadence: string
  paste_usage: string
  input_volume: string
  tab_hidden: string
  note_style: string
  phone_prefix: string
  name_shape: string
  hour_band: string
  device_shared: string
  phone_shared: string
  ip_shared: string
  movement: string
}

export const EMPTY_FEATURES: BehaviorFeatures = {
  fill_speed: 'unknown',
  key_cadence: 'unknown',
  paste_usage: 'unknown',
  input_volume: 'unknown',
  tab_hidden: 'unknown',
  note_style: 'none',
  phone_prefix: 'invalid',
  name_shape: 'unknown',
  hour_band: 'unknown',
  device_shared: 'unique',
  phone_shared: 'unique',
  ip_shared: 'unique',
  movement: 'unknown',
}

/** Counts of confirmed fake vs real orders sharing a given feature value. */
export interface FeatureStats {
  fake: number
  real: number
  seen: number
}

/** Per feature name → per value → stats. */
export type FeatureStatsRecord = Record<string, Record<string, FeatureStats>>

/** One learned bot strategy: the feature values that repeated across a fake wave. */
export interface AttackProfile {
  id: string
  /** Number of merchant-confirmed-fake orders that produced this profile. */
  confirmedSize: number
  /** The distinctive feature values, with how much more likely they are on fakes. */
  features: { name: string; value: string; lift: number }[]
  /** Weighted similarity (0..1) of the best-matching confirmed-fake order. */
  lastSeen: string
  /** When the profile was first learned (oldest confirmed-fake order in it). */
  firstSeen: string
}

export interface ProfileMatch {
  profile: AttackProfile
  /** Share of the profile's features matched by the order (0..1). */
  similarity: number
  /** Min lift over the matched features. */
  minLift: number
}

/** The compiled, per-store learned model fed to the scorer and the AI. */
export interface EngineContext {
  /** Confirmed-fake orders in the learning window. */
  sampleFake: number
  /** Confirmed-real orders in the learning window. */
  sampleReal: number
  /** Per-feature-value fake-share likelihoods (only ground-truth counts). */
  featureStats: FeatureStatsRecord
  /** Learned bot strategies of this store. */
  attackProfiles: AttackProfile[]
  /** 3-digit phone prefixes over-represented on confirmed-fake orders. */
  botPhonePrefixes: string[]
  /** 12-char prefix of IPs seen on confirmed-fake orders (pool rotation is rare). */
  botIps: string[]
  /** ISO timestamp of the most recent confirmed-fake order (recency). */
  lastFakeSeen: string | null
}

export const EMPTY_ENGINE_CONTEXT: EngineContext = {
  sampleFake: 0,
  sampleReal: 0,
  featureStats: {},
  attackProfiles: [],
  botPhonePrefixes: [],
  botIps: [],
  lastFakeSeen: null,
}

// ---------------------------------------------------------------
// Feature extraction
// ---------------------------------------------------------------

const FILL_INSTANT_MS = 1000
const FILL_QUICK_MS = 3000
const FILL_NORMAL_MS = 10000
const FILL_SLOW_MS = 30000

const KEY_INSTANT_MS = 40
const KEY_FAST_MS = 100
const KEY_HUMAN_MS = 500

const PASTE_HEAVY = 2
const INPUT_NONE = 2
const INPUT_LOW = 10
const INPUT_HIGH = 40

export function fillSpeedBucket(ms: number | null | undefined): string {
  if (ms == null) return 'unknown'
  if (ms < FILL_INSTANT_MS) return 'instant'
  if (ms < FILL_QUICK_MS) return 'quick'
  if (ms < FILL_NORMAL_MS) return 'normal'
  if (ms < FILL_SLOW_MS) return 'slow'
  return 'very_slow'
}

export function keyCadenceBucket(ms: number | null | undefined): string {
  if (ms == null) return 'unknown'
  if (ms < KEY_INSTANT_MS) return 'instant'
  if (ms < KEY_FAST_MS) return 'fast'
  if (ms < KEY_HUMAN_MS) return 'human'
  return 'slow'
}

export function pasteUsageBucket(count: number | null | undefined): string {
  if (count == null) return 'unknown'
  if (count >= PASTE_HEAVY) return 'heavy'
  if (count === 1) return 'partial'
  return 'none'
}

export function inputVolumeBucket(count: number | null | undefined): string {
  if (count == null) return 'unknown'
  if (count <= INPUT_NONE) return 'none'
  if (count <= INPUT_LOW) return 'low'
  if (count <= INPUT_HIGH) return 'normal'
  return 'high'
}

export function tabHiddenBucket(ms: number | null | undefined): string {
  if (ms == null) return 'unknown'
  return ms > 0 ? 'yes' : 'no'
}

export function noteStyleBucket(note: string | null | undefined): string {
  const v = String(note ?? '').trim()
  if (!v) return 'none'
  if (/(https?:|www\.|\.com|bit\.ly|t\.me|wa\.me)/i.test(v) || /(.)\1{4,}/.test(v)) return 'suspicious'
  if (/merci|bonjour|salam|thanks|thank you|شكرا|السلام|جازاك|جزاك|بارك|plaisir/i.test(v)) return 'polite'
  if (v.length <= 40) return 'short_neutral'
  return 'long'
}

export function nameShapeBucket(name: string | null | undefined): string {
  const v = String(name ?? '').trim()
  if (!v) return 'unknown'
  const words = v.split(/\s+/).filter(Boolean)
  if (/\d/.test(v) || /(.)\1{3,}/.test(v)) return 'weird'
  if (words.length === 1) return 'first_only'
  if (words.length === 2) return 'two_words'
  return 'three_plus'
}

export function phonePrefixBucket(phone: string | null | undefined): string {
  const norm = normalizePhone(phone)
  return norm ? norm.slice(0, 3) : 'invalid'
}

/** Algeria is UTC+1; order created_at is stored in UTC. */
export function hourBandBucket(createdAt: string): string {
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return 'unknown'
  const h = (d.getUTCHours() + 1) % 24
  if (h >= 0 && h < 6) return 'night'
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

export function movementBucket(had: boolean | null | undefined): string {
  if (had == null) return 'unknown'
  return had ? 'yes' : 'no'
}

/** Counts of shared device/phone/IP across the whole learning window. */
export interface SharingAggregates {
  deviceCounts: Map<string, number>
  phoneCounts: Map<string, number>
  ipCounts: Map<string, number>
}

export function buildSharingAggregates(orders: EngineOrderRow[], signals: EngineSignalRow[]): SharingAggregates {
  const deviceCounts = new Map<string, number>()
  const phoneCounts = new Map<string, number>()
  const ipCounts = new Map<string, number>()
  const sigByOrder = new Map(signals.map(s => [s.order_id, s]))
  for (const o of orders) {
    const s = sigByOrder.get(o.id)
    const fp = s?.device_fingerprint
    const ip = s?.ip
    const phone = normalizePhone(o.customer_phone)
    if (fp) deviceCounts.set(fp, (deviceCounts.get(fp) ?? 0) + 1)
    if (ip) ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1)
    if (phone) phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1)
  }
  return { deviceCounts, phoneCounts, ipCounts }
}

export function extractFeatures(
  order: EngineOrderRow,
  signal: EngineSignalRow | undefined,
  agg: SharingAggregates,
  allOrders: EngineOrderRow[],
): BehaviorFeatures {
  const phone = normalizePhone(order.customer_phone)
  const sharedDevice = !!signal?.device_fingerprint && (agg.deviceCounts.get(signal.device_fingerprint) ?? 0) > 1
  const sharedIp = !!signal?.ip && (agg.ipCounts.get(signal.ip) ?? 0) > 1
  const sharedPhone = !!phone && (agg.phoneCounts.get(phone) ?? 0) > 1

  // Same phone with a DIFFERENT identity is bot behaviour; same phone + same
  // name is a returning customer.
  let phoneSharedValue = 'unique'
  if (sharedPhone) {
    const normName = String(order.customer_name ?? '').trim().toLowerCase()
    const twin = allOrders.find(
      o =>
        o.id !== order.id &&
        normalizePhone(o.customer_phone) === phone &&
        String(o.customer_name ?? '').trim().toLowerCase() === normName,
    )
    phoneSharedValue = twin ? 'shared_same_name' : 'shared_diff_name'
  }

  return {
    fill_speed: fillSpeedBucket(signal?.form_fill_ms),
    key_cadence: keyCadenceBucket(signal?.avg_key_delay_ms),
    paste_usage: pasteUsageBucket(signal?.paste_events),
    input_volume: inputVolumeBucket(signal?.input_events),
    tab_hidden: tabHiddenBucket(signal?.tab_hidden_ms),
    note_style: noteStyleBucket(order.notes ?? null),
    phone_prefix: phonePrefixBucket(order.customer_phone),
    name_shape: nameShapeBucket(order.customer_name),
    hour_band: hourBandBucket(order.created_at),
    device_shared: sharedDevice ? 'shared' : 'unique',
    phone_shared: phoneSharedValue,
    ip_shared: sharedIp ? 'shared' : 'unique',
    movement: movementBucket(signal?.had_movement),
  }
}

// ---------------------------------------------------------------
// Learning from merchant ground truth
// ---------------------------------------------------------------

const FEATURE_NAMES = Object.keys(EMPTY_FEATURES)

/** Only learn from feature values with enough real data behind them. */
const MIN_GROUND_TRUTH_PER_VALUE = 2

/** A profile must repeat across at least this many confirmed-fake orders. */
const MIN_PROFILE_SIZE = 2

/** An order must match this share of a profile's features to be flagged. */
const MIN_PROFILE_SIMILARITY = 0.6

export function buildEngineContext(
  orders: EngineOrderRow[],
  signals: EngineSignalRow[],
): EngineContext {
  if (orders.length === 0) return EMPTY_ENGINE_CONTEXT

  const agg = buildSharingAggregates(orders, signals)
  const sigByOrder = new Map(signals.map(s => [s.order_id, s]))

  const fakeOrders: { features: BehaviorFeatures; createdAt: string; phonePrefix: string; ip: string }[] = []
  const featureStats: FeatureStatsRecord = {}

  const bumpStat = (feature: string, value: string, fake: boolean, real: boolean) => {
    const stat = (featureStats[feature] ??= {})[value] ??= { fake: 0, real: 0, seen: 0 }
    stat.seen++
    if (fake) stat.fake++
    else if (real) stat.real++
  }

  for (const o of orders) {
    const features = extractFeatures(o, sigByOrder.get(o.id), agg, orders)
    const confirmedFake = o.fraud_label === 'confirmed_fake'
    const confirmedReal = o.fraud_label === 'confirmed_real'
    if (!confirmedFake && !confirmedReal) continue
    for (const name of FEATURE_NAMES) {
      bumpStat(name, features[name as keyof BehaviorFeatures], confirmedFake, confirmedReal)
    }
    if (confirmedFake) {
      fakeOrders.push({
        features,
        createdAt: o.created_at,
        phonePrefix: phonePrefixBucket(o.customer_phone),
        ip: sigByOrder.get(o.id)?.ip ?? '',
      })
    }
  }

  const sampleFake = fakeOrders.length
  const sampleReal = orders.filter(o => o.fraud_label === 'confirmed_real').length

  const botPhonePrefixes = collectBotPrefixes(orders)
  const botIps = collectBotIps(orders, signals)
  const lastFakeSeen = fakeOrders.length
    ? fakeOrders.map(f => f.createdAt).sort((a, b) => (a < b ? 1 : -1))[0]
    : null

  return {
    sampleFake,
    sampleReal,
    featureStats,
    attackProfiles: learnAttackProfiles(fakeOrders, featureStats, sampleFake + sampleReal),
    botPhonePrefixes,
    botIps,
    lastFakeSeen,
  }
}

/** Phone prefixes (3 digits) over-represented on confirmed-fake orders. */
function collectBotPrefixes(orders: EngineOrderRow[]): string[] {
  const stats: Record<string, { fake: number; real: number }> = {}
  for (const o of orders) {
    const prefix = phonePrefixBucket(o.customer_phone)
    if (prefix === 'invalid') continue
    const s = (stats[prefix] ??= { fake: 0, real: 0 })
    if (o.fraud_label === 'confirmed_fake') s.fake++
    else if (o.fraud_label === 'confirmed_real') s.real++
  }
  return Object.entries(stats)
    .filter(([, s]) => s.fake >= 1 && s.fake >= s.real && s.fake + s.real >= MIN_GROUND_TRUTH_PER_VALUE)
    .map(([p]) => p)
}

/** /32 IP blocks seen on confirmed-fake orders (bots rarely rotate the block). */
function collectBotIps(orders: EngineOrderRow[], signals: EngineSignalRow[]): string[] {
  const sigByOrder = new Map(signals.map(s => [s.order_id, s]))
  const seen = new Set<string>()
  for (const o of orders) {
    if (o.fraud_label !== 'confirmed_fake') continue
    const ip = sigByOrder.get(o.id)?.ip
    if (ip) seen.add(ip.split('.').slice(0, 2).join('.'))
  }
  return [...seen]
}

/**
 * Cluster confirmed-fake orders into recurring bot strategies. Two orders join
 * the same profile when they share a majority of their "distinctive" features
 * (the values that are more likely fake than real). The result is stored as a
 * compact signature, not a list of identities — so a future wave with fresh
 * phones/fingerprints still matches the STRATEGY.
 */
function learnAttackProfiles(
  fakeOrders: { features: BehaviorFeatures; createdAt: string; phonePrefix: string; ip: string }[],
  featureStats: FeatureStatsRecord,
  totalConfirmed: number,
): AttackProfile[] {
  if (fakeOrders.length < MIN_PROFILE_SIZE) return []

  const overallFakeShare = totalConfirmed > 0 ? fakeOrders.length / totalConfirmed : 1

  // Distinctive values: fake-share above the baseline AND above a reliability
  // floor. A value that never appeared on a real order is maximally distinctive.
  const distinctive = (feature: string, value: string): number | null => {
    const stat = featureStats[feature]?.[value]
    if (!stat) return null
    if (stat.fake + stat.real < MIN_GROUND_TRUTH_PER_VALUE) return null
    const share = stat.fake / (stat.fake + stat.real)
    if (share < 0.5 || share <= overallFakeShare) return null
    return share / Math.max(overallFakeShare, 0.01) // lift vs baseline
  }

  const signatures = fakeOrders.map(f => {
    const set = new Map<string, string>()
    for (const name of FEATURE_NAMES) {
      const value = f.features[name as keyof BehaviorFeatures]
      const lift = distinctive(name, value)
      if (lift !== null) set.set(name, value)
    }
    return { order: f, signature: set }
  })

  // Greedy clustering: repeatedly take the largest remaining signature as the
  // seed of a profile and absorb any other signature sharing >= 60% of it.
  const profiles: AttackProfile[] = []
  const used = new Set<number>()
  let clusterId = 0

  for (let i = 0; i < signatures.length; i++) {
    if (used.has(i)) continue
    const seed = signatures[i]
    if (seed.signature.size === 0) continue

    const members: number[] = [i]
    for (let j = i + 1; j < signatures.length; j++) {
      if (used.has(j) || signatures[j].signature.size === 0) continue
      const shared = [...seed.signature.entries()].filter(
        ([k, v]) => signatures[j].signature.get(k) === v,
      ).length
      const denom = Math.max(seed.signature.size, signatures[j].signature.size)
      if (shared / denom >= 0.6) members.push(j)
    }
    if (members.length < MIN_PROFILE_SIZE) {
      // A lone fake order's signature is still kept as a small profile when the
      // store has confirmed fakes but too few to cluster — a partial match on
      // it is weak evidence, so it only fires with high similarity.
      for (const m of members) used.add(m)
      continue
    }

    const profileFeatures = [...seed.signature.entries()]
      .map(([name, value]) => {
        const lift = distinctive(name, value) ?? 1
        return { name, value, lift }
      })
      .sort((a, b) => b.lift - a.lift)
      .slice(0, 6)

    const timestamps = members.map(m => signatures[m].order.createdAt)
    profiles.push({
      id: `profile-${clusterId++}`,
      confirmedSize: members.length,
      features: profileFeatures,
      lastSeen: timestamps.sort((a, b) => (a < b ? 1 : -1))[0],
      firstSeen: timestamps.sort((a, b) => (a < b ? -1 : 1))[0],
    })
    for (const m of members) used.add(m)
  }

  return profiles
}

/**
 * Score a fresh order's features against every stored profile. The best match
 * above the similarity floor (and with enough confirmed evidence) is returned.
 */
export function matchAttackProfiles(features: BehaviorFeatures, profiles: AttackProfile[]): ProfileMatch | null {
  let best: ProfileMatch | null = null
  for (const profile of profiles) {
    if (profile.confirmedSize < MIN_PROFILE_SIZE) continue
    const matched = profile.features.filter(f => features[f.name as keyof BehaviorFeatures] === f.value)
    const similarity = profile.features.length ? matched.length / profile.features.length : 0
    if (similarity < MIN_PROFILE_SIMILARITY) continue
    const minLift = matched.length ? Math.min(...matched.map(f => f.lift)) : 1
    if (!best || similarity > best.similarity) {
      best = { profile, similarity, minLift }
    }
  }
  return best
}

// ---------------------------------------------------------------
// Human-readable rendering for the AI prompt
// ---------------------------------------------------------------

export const FEATURE_LABELS: Record<string, string> = {
  fill_speed: 'vitesse de remplissage',
  key_cadence: 'cadence de frappe',
  paste_usage: 'collage de texte',
  input_volume: 'volume de saisie',
  tab_hidden: 'onglet caché',
  note_style: 'style de note',
  phone_prefix: 'préfixe téléphone',
  name_shape: 'forme du nom',
  hour_band: 'heure de la commande',
  device_shared: 'appareil partagé',
  phone_shared: 'téléphone partagé',
  ip_shared: 'IP partagée',
  movement: 'mouvement souris',
}

export const VALUE_LABELS: Record<string, string> = {
  instant: '< 1 s', quick: '1-3 s', normal: '3-10 s', slow: '10-30 s', very_slow: '> 30 s',
  heavy: 'collage systématique', partial: '1 collage', none: 'aucun',
  low: 'très peu de saisie', high: 'saisie massive',
  yes: 'oui', no: 'non',
  short_neutral: 'note courte neutre', polite: 'note polie', suspicious: 'note suspecte', long: 'note longue',
  first_only: 'prénom seul', two_words: '2 mots', three_plus: '3+ mots', weird: 'nom bizarre',
  night: 'nuit', morning: 'matin', afternoon: 'après-midi', evening: 'soir',
  shared_diff_name: 'numéro réutilisé avec autre identité',
}

export function describeProfile(profile: AttackProfile): string {
  const feats = profile.features
    .map(f => `${FEATURE_LABELS[f.name] ?? f.name} = « ${VALUE_LABELS[f.value] ?? f.value} »`)
    .join(', ')
  return `Stratégie bot (${profile.confirmedSize} commande(s) confirmée(s) fausse(s)) — ${feats}`
}

/**
 * Compact block for the AI prompt: what the store's confirmed history says a
 * bot looks like HERE, with per-feature fake-share and learned profiles.
 */
export function buildEngineIntelligenceBlock(ctx: EngineContext): string {
  if (ctx.sampleFake === 0) {
    return '(boutique sans fausse commande confirmée — modèle non entraîné)'
  }
  const lines: string[] = []
  lines.push(`- Base apprise: ${ctx.sampleFake} fausse(s) / ${ctx.sampleReal} réelle(s) confirmée(s) par le marchand`)

  // Most distinctive feature values (highest fake-share with decent data).
  const discriminators: { label: string; value: string; share: number; n: number }[] = []
  for (const [feature, byValue] of Object.entries(ctx.featureStats)) {
    for (const [value, stat] of Object.entries(byValue)) {
      if (stat.fake + stat.real < MIN_GROUND_TRUTH_PER_VALUE) continue
      const share = stat.fake / (stat.fake + stat.real)
      if (share >= 0.6) {
        discriminators.push({ label: FEATURE_LABELS[feature] ?? feature, value: VALUE_LABELS[value] ?? value, share, n: stat.fake })
      }
    }
  }
  discriminators.sort((a, b) => b.share - a.share || b.n - a.n)
  if (discriminators.length) {
    lines.push('- Caractéristiques statistiquement liées aux FAUSSES commandes ici:')
    for (const d of discriminators.slice(0, 10)) {
      lines.push(`  · ${d.label} = « ${d.value} » (${Math.round(d.share * 100)}% des cas confirmés, n=${d.n})`)
    }
  }

  if (ctx.attackProfiles.length) {
    lines.push('- Stratégies de bot apprises sur cette boutique:')
    for (const p of ctx.attackProfiles) {
      lines.push(`  · ${describeProfile(p)}`)
    }
  }
  if (ctx.botPhonePrefixes.length) {
    lines.push(`- Préfixes téléphoniques liés à des fausses commandes: ${ctx.botPhonePrefixes.join(', ')}`)
  }
  if (ctx.botIps.length) {
    lines.push(`- Blocs IP liés à des fausses commandes: ${ctx.botIps.map(b => `${b}.x.x`).join(', ')}`)
  }
  return lines.join('\n')
}
