// ============================================================
// Fraud Shield v1 — hand-tuned rule-based risk scoring.
//
// Combines nine independent signals into a 0-100 risk score. Every signal
// that fires is returned with its point contribution and a French detail
// string for display on /dashboard/fraud-shield. This is intentionally a
// pure function (no DB/network access) so it's fully unit-testable; the
// caller (the orders API route) is responsible for gathering the inputs.
//
// v2 (see design spec): once enough orders have been confirmed
// fake/real via the dashboard, these hand-tuned weights get replaced by a
// model trained on the same features — the shape of FraudSignalInputs is
// exactly the feature set that model will consume.
// ============================================================

import { COMMUNES_BY_WILAYA } from '../communes'

export interface FraudSignalInputs {
  ipCountry: string | null
  ipIsProxyOrHosting: boolean
  fingerprintSeenRecently: boolean
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

// Communes are keyed by the canonical wilaya spelling in src/lib/communes.ts;
// storefront forms can submit alternate spellings, so match wilayas by a
// normalized (accent/case/punctuation-insensitive) key.
const NORMALIZED_WILAYA_KEYS = new Map<string, string>(
  Object.keys(COMMUNES_BY_WILAYA).map(k => [normalizePlace(k), k]),
)

export function computeFraudRiskScore(input: FraudSignalInputs): FraudSignalResult {
  const signals: Record<string, FraudSignal> = {}

  if (input.ipIsProxyOrHosting) {
    signals.datacenter_ip = { points: 25, detail: 'IP identifiée comme proxy/VPN/hébergeur' }
  }

  if (input.fingerprintSeenRecently) {
    signals.fingerprint_reuse = { points: 30, detail: 'Même appareil déjà utilisé pour une autre commande récente' }
  }

  if (!input.hadMovement && input.formFillMs !== null && input.formFillMs < 1500) {
    signals.no_human_behavior = { points: 15, detail: 'Aucun mouvement détecté et formulaire rempli en moins de 1,5s' }
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

  const currentPhone = normalizePhone(input.customerPhone)
  const previousPhones = (input.previousOrderPhones ?? [])
    .map(normalizePhone)
    .filter((p): p is string => p !== null)
  if (currentPhone && previousPhones.includes(currentPhone)) {
    signals.repeated_phone = {
      points: 25,
      detail: 'Numéro de téléphone déjà utilisé pour une commande récente du même magasin',
    }
  }

  const currentName = normalizeName(input.customerName)
  const previousNames = (input.previousOrderNames ?? [])
    .map(normalizeName)
    .filter((n): n is string => n !== null)
  if (currentName && previousNames.includes(currentName) && !(currentPhone && previousPhones.includes(currentPhone))) {
    signals.repeated_identity = {
      points: 10,
      detail: "Même nom de client qu'une commande récente, mais numéro de téléphone différent",
    }
  }

  if (input.wilaya && input.commune) {
    const communes = communesForWilaya(input.wilaya)
    if (communes.length > 0) {
      const submitted = normalizePlace(input.commune)
      if (submitted && !communes.some(c => normalizePlace(c) === submitted)) {
        signals.wilaya_commune_mismatch = {
          points: 15,
          detail: `La commune « ${input.commune} » ne figure pas dans la wilaya ${input.wilaya}`,
        }
      }
    }
  }

  const burst = detectBurst(input.currentOrderTimestamp, input.previousOrderTimestamps)
  if (burst) {
    signals.burst_velocity = {
      points: 15,
      detail: `Plusieurs commandes (${burst.count}) passées en ${Math.max(1, Math.round(burst.spanSeconds / 60))} min`,
    }
  }

  const score = Math.min(100, Object.values(signals).reduce((sum, s) => sum + s.points, 0))
  return { score, signals }
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

/** Algerian mobile → canonical 10-digit form (05/06/07 + 8 digits), else null. */
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = String(raw).replace(/\D/g, '')
  if (digits.length >= 11 && digits.startsWith('213')) digits = digits.slice(3)
  if (digits.length === 9 && /^[567]/.test(digits)) digits = `0${digits}`
  return /^(05|06|07)\d{8}$/.test(digits) ? digits : null
}

function normalizeName(raw: string | null | undefined): string | null {
  if (!raw) return null
  const name = String(raw).toLowerCase().replace(/\s+/g, ' ').trim()
  return name.length >= 2 ? name : null
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
