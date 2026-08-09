// ============================================================
// Fraud Shield v3 — adaptive rule-based risk scoring.
//
// Combines independent signals into a 0-100 risk score. Every signal that
// fires is returned with its point contribution and a French detail string
// for display on the orders dashboard. This is intentionally a pure function
// (no DB/network access) so it's fully unit-testable; the caller (the orders
// API route) gathers the inputs AND the store's adaptive profile (see
// fraud-shield/adaptive.ts).
//
// v3 changes versus v1, all aimed at cutting false positives on REAL customers
// while keeping up with an evolving bot:
//   - A single-word name (first name only, missing last name) is NORMAL and is
//     never flagged on its own.
//   - Same phone + same name = a returning customer, NOT fraud (only a quick
//     repeat inside a burst is lightly flagged). Same phone + DIFFERENT
//     identity = bot behaviour and is strongly flagged.
//   - Commune/wilaya matching tolerates typos (real people misspell), so only
//     a genuine mismatch is flagged.
//   - Adaptive weights: the store's confirmed_fake/confirmed_real history can
//     boost or suppress each signal, and devices/phones proven fake hard-flag
//     future orders through the bot_cluster signal (the counter-attack).
// ============================================================

import { COMMUNES_BY_WILAYA } from '../communes'
import {
  normalizePhone,
  reputationFor,
  type AdaptiveContext,
} from './adaptive'
import {
  matchAttackProfiles,
  type BehaviorFeatures,
  type EngineContext,
} from './engine'

/** Rich behavioral signals captured by the storefront (see client-signals). */
export interface BehavioralInput {
  inputEvents?: number | null
  pasteEvents?: number | null
  avgKeyDelayMs?: number | null
  tabHiddenMs?: number | null
  scrollEvents?: number | null
  focusEvents?: number | null
}

export interface FraudSignalInputs {
  ipCountry: string | null
  ipIsProxyOrHosting: boolean
  fingerprintSeenRecently: boolean
  /** The current order's device fingerprint (for adaptive reputation lookup). */
  deviceFingerprint?: string | null
  /** The current order's request IP (for adaptive reputation lookup). */
  ip?: string | null
  hadMovement: boolean
  formFillMs: number | null
  /** ISO timestamp of the order currently being scored. */
  currentOrderTimestamp: string
  /** This store's previous orders' created_at, most-recent-first. */
  previousOrderTimestamps: string[]
  /** Current customer's phone as submitted. */
  customerPhone: string | null
  /** Current customer's name as submitted. */
  customerName: string | null
  /** Current order's wilaya. */
  wilaya: string | null
  /** Current order's commune. */
  commune: string | null
  /** Previous orders' customer phone, most-recent-first. */
  previousOrderPhones: (string | null)[]
  /** Previous orders' customer name, most-recent-first. */
  previousOrderNames: (string | null)[]
  /** Learned per-store threat profile (see adaptive.ts). Optional. */
  adaptive?: AdaptiveContext
  /** Rich behavioral capture from the storefront (paste, keystroke cadence…). Optional. */
  behavioral?: BehavioralInput
  /** The evolving engine's learned model for this store (see engine.ts). Optional. */
  engine?: EngineContext
  /** This order's extracted behavioral features (see engine.extractFeatures). Optional. */
  features?: BehaviorFeatures
}

export interface FraudSignal {
  points: number
  detail: string
}

export interface FraudSignalResult {
  score: number
  signals: Record<string, FraudSignal>
}

const HOME_COUNTRY = 'DZ'
// Up to this many total data points (current order + previous ones) are used
// to judge timing regularity.
const TIMING_WINDOW = 5
const MIN_GAPS_FOR_TIMING_CHECK = 3
const MIN_MEAN_GAP_SECONDS = 30
const MAX_MEAN_GAP_SECONDS = 900
const MAX_COEFFICIENT_OF_VARIATION = 0.3

// A burst = that many orders (current + previous) landing within a few
// minutes, regardless of phone/name. Bots that rotate phone numbers to dodge
// the DB same-phone spam guard still produce this signature.
const MIN_ORDERS_FOR_BURST = 3
const BURST_WINDOW_SECONDS = 180

// The store is considered under sustained bot attack once this share of its
// recent history is confirmed fake — hardens the common signals.
const HIGH_PRESSURE_THRESHOLD = 0.3

// A "fast autofill without any movement" is only suspicious when it is
// IMPOSSIBLY fast. Real customers autofill or type quickly on mobile.
const NO_HUMAN_FILL_MS = 1000

// ── Behavioral autofill thresholds (from client-signals rich capture).
// Autofill floods change events and pastes values; humans type at ~100-500ms
// per keystroke and never paste 2+ fields with a sub-100ms cadence.
const AUTOFILL_PASTE_MIN = 2
const AUTOFILL_MAX_KEY_DELAY_MS = 100
const AUTOFILL_MAX_FILL_MS = 2000
const AUTOFILL_MAX_INPUTS = 8
const KEY_IMPOSSIBLE_MS = 40
const HIDDEN_TAB_MIN_MS = 5000
const HIDDEN_TAB_MAX_FILL_MS = 15000

// Communes are keyed by the canonical wilaya spelling in src/lib/communes.ts;
// storefront forms can submit alternate spellings, so match wilayas by a
// normalized (accent/case/punctuation-insensitive) key.
const NORMALIZED_WILAYA_KEYS = new Map<string, string>(
  Object.keys(COMMUNES_BY_WILAYA).map(k => [normalizePlace(k), k]),
)

export function computeFraudRiskScore(input: FraudSignalInputs): FraudSignalResult {
  const signals: Record<string, FraudSignal> = {}
  const adaptive = input.adaptive
  const highPressure = !!adaptive && adaptive.botPressure >= HIGH_PRESSURE_THRESHOLD

  // ── Bot counter-attack: a device/phone/IP already tied to confirmed-fake (or
  //    high-risk) orders at this store is flagged even if its last appearance
  //    falls outside the short "recently seen" window. A bot that rotates
  //    device fingerprint, phone AND name per order but reuses the same
  //    (rented) IP pool is caught here even though the fingerprint/phone
  //    checks alone see nothing repeating.
  if (adaptive) {
    const rep = reputationFor(adaptive, input.deviceFingerprint ?? null, input.customerPhone, input.ip ?? null)
    if (rep.isKnownBotDevice) {
      const ipOnly = !!rep.ip?.fake && !rep.fingerprint?.fake && !rep.phone?.fake
      signals.bot_cluster = {
        points: highPressure ? 45 : 30,
        detail: ipOnly
          ? 'IP déjà liée à des commandes frauduleuses confirmées dans cette boutique (appareil et numéro différents)'
          : 'Appareil ou numéro déjà lié à des commandes frauduleuses confirmées dans cette boutique',
      }
    }
  }

  if (input.ipIsProxyOrHosting) {
    signals.datacenter_ip = {
      points: highPressure ? 30 : 25,
      detail: 'IP identifiée comme proxy/VPN/hébergeur',
    }
  }

  if (input.fingerprintSeenRecently) {
    const rep = adaptive && input.deviceFingerprint
      ? adaptive.fingerprintReputation[input.deviceFingerprint] ?? null
      : null
    let points = 15
    if (rep) {
      // A device proven real = a returning customer on their own phone.
      if (rep.real >= 1) points = 0
      else if (rep.fake >= 1) points = 35
    }
    if (points > 0 && highPressure) points = Math.max(points, 20)
    if (points > 0) {
      signals.fingerprint_reuse = {
        points,
        detail: rep?.fake
          ? 'Même appareil déjà associé à des commandes frauduleuses'
          : 'Même appareil déjà utilisé pour une autre commande récente',
      }
    }
  }

  if (!input.hadMovement && input.formFillMs !== null && input.formFillMs < NO_HUMAN_FILL_MS) {
    signals.no_human_behavior = {
      points: 10,
      detail: 'Aucun mouvement détecté et formulaire rempli en moins d\'une seconde',
    }
  }

  // ── Evolving-engine signals: autofill, keystroke cadence, learned attack
  //    profiles and bot prefix pools. These only fire on OBSERVED values
  //    (null/missing fields stay neutral — a bot that hides its behavior is
  //    not rewarded, but a real customer who never triggers the tracker is
  //    not punished either).
  const b = input.behavioral ?? {}
  const autofillByPaste =
    (b.pasteEvents ?? 0) >= AUTOFILL_PASTE_MIN &&
    b.avgKeyDelayMs != null &&
    b.avgKeyDelayMs < AUTOFILL_MAX_KEY_DELAY_MS
  const autofillBySpeed =
    input.formFillMs !== null &&
    input.formFillMs < AUTOFILL_MAX_FILL_MS &&
    (b.inputEvents ?? Infinity) <= AUTOFILL_MAX_INPUTS &&
    !input.hadMovement

  if (autofillByPaste || autofillBySpeed) {
    signals.behavioral_autofill = {
      points: highPressure ? 35 : 25,
      detail: autofillByPaste
        ? `Formulaire rempli par collage (${b.pasteEvents ?? 0} champs) à cadence impossiblement rapide (${Math.round(b.avgKeyDelayMs ?? 0)} ms/événement)`
        : `Formulaire rempli en ${Math.round(input.formFillMs ?? 0)} ms sans mouvement ni saisie manuelle (${b.inputEvents ?? 0} entrées) — autofill de bot`,
    }
  }

  if (b.avgKeyDelayMs != null && b.avgKeyDelayMs < KEY_IMPOSSIBLE_MS) {
    signals.keystroke_anomaly = {
      points: highPressure ? 25 : 20,
      detail: `Cadence de frappe de ${Math.round(b.avgKeyDelayMs)} ms par touche — impossible pour un humain (autofill)`,
    }
  }

  if (
    b.tabHiddenMs != null &&
    b.tabHiddenMs >= HIDDEN_TAB_MIN_MS &&
    input.formFillMs !== null &&
    input.formFillMs < HIDDEN_TAB_MAX_FILL_MS
  ) {
    signals.hidden_tab_fill = {
      points: 8,
      detail: 'Formulaire rempli pendant que l\'onglet était masqué',
    }
  }

  if (input.features && input.engine && input.engine.attackProfiles.length) {
    const profileMatch = matchAttackProfiles(input.features, input.engine.attackProfiles)
    if (profileMatch) {
      signals.attack_profile_match = {
        points: highPressure ? 40 : 30,
        detail: `Comportement identique à une stratégie de bot apprise sur cette boutique (${Math.round(profileMatch.similarity * 100)}% de correspondance, ${profileMatch.profile.confirmedSize} commande(s) confirmée(s) fausse(s))`,
      }
    }
  }

  if (input.engine?.botPhonePrefixes?.length && input.customerPhone) {
    const norm = normalizePhone(input.customerPhone)
    if (norm && input.engine.botPhonePrefixes.includes(norm.slice(0, 3))) {
      signals.phone_prefix_pool = {
        points: 12,
        detail: `Préfixe ${norm.slice(0, 3)} associé à des commandes frauduleuses confirmées dans cette boutique`,
      }
    }
  }

  if (input.ipCountry && input.ipCountry !== HOME_COUNTRY) {
    signals.ip_country_mismatch = { points: 10, detail: `IP localisée hors Algérie (${input.ipCountry})` }
  }

  const timing = detectRegularTiming(input.currentOrderTimestamp, input.previousOrderTimestamps)
  if (timing) {
    signals.timing_regularity = {
      points: 20,
      detail: `Intervalle régulier entre commandes (~${Math.round(timing.meanSeconds)}s, écart-type ${Math.round(timing.stdDevSeconds)}s)`,
    }
  }

  const burst = detectBurst(input.currentOrderTimestamp, input.previousOrderTimestamps)

  // ── Phone reuse. The identity attached to the phone decides how serious it
  //    is: same name = returning customer (not fraud), different name = the
  //    bot switching identities while keeping its phone pool.
  const currentPhone = normalizePhone(input.customerPhone)
  const previousPhones = (input.previousOrderPhones ?? []).map(normalizePhone)
  const previousNames = (input.previousOrderNames ?? []).map(normalizeName)
  const currentName = normalizeName(input.customerName)
  if (currentPhone && previousPhones.includes(currentPhone)) {
    const matchingIndices = previousPhones
      .map((p, i) => (p === currentPhone ? i : -1))
      .filter(i => i >= 0)
    const namesComparable = matchingIndices.some(i => previousNames[i] !== null)
    const sameIdentity =
      currentName !== null && matchingIndices.every(i => previousNames[i] === currentName)
    const phoneRep = adaptive ? adaptive.phoneReputation[currentPhone] : undefined

    if (phoneRep?.fake) {
      signals.repeated_phone = {
        points: 35,
        detail: 'Téléphone déjà associé à des commandes frauduleuses confirmées',
      }
    } else if (sameIdentity && !burst) {
      // Returning customer on their own phone — a REAL person, not fraud.
    } else if (sameIdentity && burst) {
      signals.repeated_phone = {
        points: 10,
        detail: 'Même téléphone réutilisé très rapidement (rafale de commandes du même client)',
      }
    } else if (namesComparable) {
      signals.repeated_phone = {
        points: 25,
        detail: 'Même téléphone utilisé avec une identité différente sur une commande récente',
      }
    } else {
      signals.repeated_phone = {
        points: 25,
        detail: 'Numéro de téléphone déjà utilisé pour une commande récente du même magasin',
      }
    }
  }

  // ── Repeated identity WITHOUT the same phone. Only a full multi-word name
  //    match counts: first-name-only customers are everywhere in Algeria and
  //    MUST never be flagged for having a common first name.
  if (currentName && isMultiWord(currentName) && previousNames.includes(currentName)) {
    const samePhoneMatch = currentPhone && previousPhones.includes(currentPhone)
    if (!samePhoneMatch) {
      signals.repeated_identity = {
        points: 10,
        detail: 'Même nom complet qu\'une commande récente, mais numéro de téléphone différent',
      }
    }
  }

  if (input.wilaya && input.commune) {
    const communes = communesForWilaya(input.wilaya)
    if (communes.length > 0) {
      const submitted = normalizePlace(input.commune)
      if (submitted && !communes.some(c => communesMatch(normalizePlace(c), submitted))) {
        signals.wilaya_commune_mismatch = {
          points: 15,
          detail: `La commune « ${input.commune} » ne figure pas dans la wilaya ${input.wilaya}`,
        }
      }
    }
  }

  if (burst) {
    signals.burst_velocity = {
      points: highPressure ? 25 : 15,
      detail: `Plusieurs commandes (${burst.count}) passées en ${Math.max(1, Math.round(burst.spanSeconds / 60))} min`,
    }
  }

  const score = Math.min(100, Object.values(signals).reduce((sum, s) => sum + s.points, 0))
  return { score, signals }
}

function isMultiWord(name: string): boolean {
  return name.split(' ').filter(Boolean).length >= 2
}

function detectRegularTiming(
  currentTimestamp: string,
  previousTimestampsMostRecentFirst: string[],
): { meanSeconds: number; stdDevSeconds: number } | null {
  const times = [currentTimestamp, ...previousTimestampsMostRecentFirst]
    .slice(0, TIMING_WINDOW)
    .map(t => new Date(t).getTime())
    .sort((a, b) => a - b) // oldest to newest

  if (times.length < MIN_GAPS_FOR_TIMING_CHECK + 1) return null

  const gapsSeconds: number[] = []
  for (let i = 1; i < times.length; i++) {
    gapsSeconds.push((times[i] - times[i - 1]) / 1000)
  }

  const mean = gapsSeconds.reduce((a, b) => a + b, 0) / gapsSeconds.length
  if (mean < MIN_MEAN_GAP_SECONDS || mean > MAX_MEAN_GAP_SECONDS) return null

  const variance = gapsSeconds.reduce((a, b) => a + (b - mean) ** 2, 0) / gapsSeconds.length
  const stdDev = Math.sqrt(variance)
  const coefficientOfVariation = mean === 0 ? Infinity : stdDev / mean

  if (coefficientOfVariation >= MAX_COEFFICIENT_OF_VARIATION) return null
  return { meanSeconds: mean, stdDevSeconds: stdDev }
}

function detectBurst(
  currentTimestamp: string,
  previousTimestampsMostRecentFirst: string[],
): { count: number; spanSeconds: number } | null {
  const times = [currentTimestamp, ...previousTimestampsMostRecentFirst]
    .slice(0, TIMING_WINDOW)
    .map(t => new Date(t).getTime())
    .sort((a, b) => a - b)

  if (times.length < MIN_ORDERS_FOR_BURST) return null
  const spanSeconds = (times[times.length - 1] - times[0]) / 1000
  if (spanSeconds > BURST_WINDOW_SECONDS) return null
  return { count: times.length, spanSeconds }
}

/** Commune list for a wilaya (any casing/accent spelling), or [] if unknown. */
function communesForWilaya(wilaya: string): string[] {
  const key = NORMALIZED_WILAYA_KEYS.get(normalizePlace(wilaya))
  return key ? COMMUNES_BY_WILAYA[key] : []
}

/**
 * Lenient commune comparison: real people typo commune names, so a near-match
 * is treated as valid. Exact normalized match, prefix match (long enough), or
 * an edit distance ≤ 2 all count as the same commune.
 */
function communesMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (a.length >= 5 && (a.startsWith(b) || b.startsWith(a))) return true
  return levenshtein(a, b) <= 2
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i)
  const cur = new Array(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]
  }
  return cur[b.length]
}

/** Lowercase, accent-stripped, punctuation-free form for commune/wilaya matching. */
function normalizePlace(raw: string | null | undefined): string {
  if (!raw) return ''
  return String(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/** Single-word-named customers are normal; only multi-word names can repeat. */
function normalizeName(raw: string | null | undefined): string | null {
  if (!raw) return null
  const name = String(raw).toLowerCase().replace(/\s+/g, ' ').trim()
  return name.length >= 2 ? name : null
}
