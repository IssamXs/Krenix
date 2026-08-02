// ============================================================
// Fraud Shield v1 — hand-tuned rule-based risk scoring.
//
// Combines four independent signals into a 0-100 risk score. Every signal
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
