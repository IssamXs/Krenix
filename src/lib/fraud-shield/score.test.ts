import { describe, it, expect } from 'vitest'
import { computeFraudRiskScore, type FraudSignalInputs } from './score'
import { buildAdaptiveContext, type OrderHistoryRow, type SignalHistoryRow } from './adaptive'
import { buildEngineContext, extractFeatures, buildSharingAggregates } from './engine'

const T0 = '2026-08-05T12:00:00.000Z'
const HOUR = 3600_000
const DAY = 24 * HOUR

function base(overrides: Partial<FraudSignalInputs> = {}): FraudSignalInputs {
  return {
    ipCountry: null,
    ipIsProxyOrHosting: false,
    fingerprintSeenRecently: false,
    deviceFingerprint: null,
    hadMovement: true,
    formFillMs: null,
    currentOrderTimestamp: T0,
    previousOrderTimestamps: [],
    customerPhone: null,
    customerName: null,
    wilaya: null,
    commune: null,
    previousOrderPhones: [],
    previousOrderNames: [],
    ...overrides,
  }
}

const minutesAgo = (minutes: number) => new Date(Date.parse(T0) - minutes * 60_000).toISOString()
const secondsAgo = (seconds: number) => new Date(Date.parse(T0) - seconds * 1000).toISOString()

describe('computeFraudRiskScore — existing signals', () => {
  it('scores zero for a clean order', () => {
    const { score, signals } = computeFraudRiskScore(base())
    expect(score).toBe(0)
    expect(Object.keys(signals)).toHaveLength(0)
  })

  it('flags datacenter IP, fingerprint reuse and foreign country', () => {
    const { score, signals } = computeFraudRiskScore(
      base({ ipIsProxyOrHosting: true, fingerprintSeenRecently: true, ipCountry: 'FR' }),
    )
    expect(score).toBe(25 + 15 + 10)
    expect(signals.datacenter_ip.points).toBe(25)
    expect(signals.fingerprint_reuse.points).toBe(15)
    expect(signals.ip_country_mismatch.points).toBe(10)
  })

  it('flags impossibly fast fills without movement (under 1s)', () => {
    const { score, signals } = computeFraudRiskScore(base({ hadMovement: false, formFillMs: 400 }))
    expect(score).toBe(10)
    expect(signals.no_human_behavior.points).toBe(10)
  })

  it('does not flag sub-1.5s fills or slow fills', () => {
    expect(computeFraudRiskScore(base({ hadMovement: false, formFillMs: 1200 })).signals.no_human_behavior).toBeUndefined()
    expect(computeFraudRiskScore(base({ hadMovement: false, formFillMs: 5000 })).signals.no_human_behavior).toBeUndefined()
  })
})

describe('computeFraudRiskScore — timing', () => {
  it('flags a regular inter-order interval', () => {
    const { signals } = computeFraudRiskScore(
      base({
        previousOrderTimestamps: [minutesAgo(1), minutesAgo(2), minutesAgo(3), minutesAgo(4)],
      }),
    )
    expect(signals.timing_regularity.points).toBe(20)
  })

  it('does not flag irregular spacing', () => {
    const { signals } = computeFraudRiskScore(
      base({
        previousOrderTimestamps: [minutesAgo(3), minutesAgo(10), minutesAgo(45), minutesAgo(240)],
      }),
    )
    expect(signals.timing_regularity).toBeUndefined()
  })
})

describe('computeFraudRiskScore — repeat phone/name', () => {
  it('flags a phone reused with a different identity', () => {
    const { score, signals } = computeFraudRiskScore(
      base({
        customerPhone: '0555123456',
        customerName: 'Karim Haddad',
        previousOrderTimestamps: [minutesAgo(30), minutesAgo(60)],
        previousOrderPhones: ['0555123456', '0666123456'],
        previousOrderNames: ['Amira Benali', 'Sara Kaci'],
      }),
    )
    expect(score).toBe(25)
    expect(signals.repeated_phone.points).toBe(25)
    expect(signals.repeated_identity).toBeUndefined()
  })

  it('does NOT flag a returning customer reusing the same phone AND name', () => {
    const { score, signals } = computeFraudRiskScore(
      base({
        customerPhone: '0555123456',
        customerName: 'Amira Benali',
        previousOrderTimestamps: [minutesAgo(30), minutesAgo(240)],
        previousOrderPhones: ['0555123456'],
        previousOrderNames: ['Amira Benali'],
      }),
    )
    expect(score).toBe(0)
    expect(Object.keys(signals)).toHaveLength(0)
  })

  it('lightly flags a same phone+name order repeated inside a burst', () => {
    const { score, signals } = computeFraudRiskScore(
      base({
        customerPhone: '0555123456',
        customerName: 'Amira Benali',
        previousOrderTimestamps: [secondsAgo(60), secondsAgo(120)],
        previousOrderPhones: ['0555123456'],
        previousOrderNames: ['Amira Benali'],
      }),
    )
    expect(score).toBe(25) // burst 15 + repeated_phone 10
    expect(signals.repeated_phone.points).toBe(10)
  })

  it('normalizes +213 and spaced phone variants before matching', () => {
    const { signals } = computeFraudRiskScore(
      base({
        customerPhone: '+213 770 12 34 56',
        previousOrderTimestamps: [minutesAgo(30)],
        previousOrderPhones: ['0770123456'],
        previousOrderNames: [],
      }),
    )
    expect(signals.repeated_phone.points).toBe(25)
  })

  it('does not flag when the phone differs', () => {
    const { signals } = computeFraudRiskScore(
      base({
        customerPhone: '0555123456',
        previousOrderTimestamps: [minutesAgo(30)],
        previousOrderPhones: ['0666123456'],
      }),
    )
    expect(signals.repeated_phone).toBeUndefined()
  })

  it('flags a repeated multi-word name with a different phone', () => {
    const { score, signals } = computeFraudRiskScore(
      base({
        customerName: 'Amira B.',
        customerPhone: '0555123456',
        previousOrderTimestamps: [minutesAgo(30)],
        previousOrderNames: ['amira   b.'],
        previousOrderPhones: ['0666123456'],
      }),
    )
    expect(score).toBe(10)
    expect(signals.repeated_identity.points).toBe(10)
  })

  it('does NOT flag a repeated single-word first name (missing last name is normal)', () => {
    const { score, signals } = computeFraudRiskScore(
      base({
        customerName: 'Amira',
        customerPhone: '0555123456',
        previousOrderTimestamps: [minutesAgo(30)],
        previousOrderNames: ['Amira'],
        previousOrderPhones: ['0666123456'],
      }),
    )
    expect(score).toBe(0)
    expect(signals.repeated_identity).toBeUndefined()
  })

  it('does NOT flag the second "Amira" with a different name spelling', () => {
    const { signals } = computeFraudRiskScore(
      base({
        customerName: 'Amira',
        previousOrderTimestamps: [minutesAgo(30)],
        previousOrderNames: ['Amir'],
      }),
    )
    expect(signals.repeated_identity).toBeUndefined()
  })
})

describe('computeFraudRiskScore — commune/wilaya', () => {
  it('flags a commune that does not belong to the wilaya', () => {
    const { score, signals } = computeFraudRiskScore(
      base({ wilaya: 'Alger', commune: 'Ouled Ziad' }),
    )
    expect(score).toBe(15)
    expect(signals.wilaya_commune_mismatch.points).toBe(15)
  })

  it('accepts a commune from the wilaya list (case/accent-insensitive)', () => {
    const { signals } = computeFraudRiskScore(base({ wilaya: 'Sétif', commune: 'Setif' }))
    expect(signals.wilaya_commune_mismatch).toBeUndefined()
  })

  it('resolves alternate wilaya spellings', () => {
    const { signals } = computeFraudRiskScore(base({ wilaya: 'Setif', commune: 'El Eulma' }))
    expect(signals.wilaya_commune_mismatch).toBeUndefined()
  })

  it('tolerates typos in the commune (real people misspell)', () => {
    expect(computeFraudRiskScore(base({ wilaya: 'Alger', commune: 'Alger Centr' })).signals.wilaya_commune_mismatch).toBeUndefined()
    expect(computeFraudRiskScore(base({ wilaya: 'Alger', commune: 'Bouzareah' })).signals.wilaya_commune_mismatch).toBeUndefined()
  })

  // Illizi/Bordj Badji Mokhtar/In Guezzam/Djanet used to have no commune data
  // (the source CSV predates their 2019 creation) and this check was skipped
  // for them entirely — a fraud-detection blind spot. Now filled in by hand
  // in communes.ts, so these wilayas get the same validation as the other 54.
  it('validates communes for the four wilayas the source CSV predates', () => {
    expect(computeFraudRiskScore(base({ wilaya: 'Illizi', commune: 'In Amenas' })).signals.wilaya_commune_mismatch).toBeUndefined()
    expect(computeFraudRiskScore(base({ wilaya: 'Illizi', commune: 'Fiction' })).signals.wilaya_commune_mismatch.points).toBe(15)
  })
})

describe('computeFraudRiskScore — burst velocity', () => {
  it('flags several orders within a few minutes', () => {
    const { score, signals } = computeFraudRiskScore(
      base({ previousOrderTimestamps: [secondsAgo(90), secondsAgo(120), secondsAgo(150)] }),
    )
    expect(score).toBe(15)
    expect(signals.burst_velocity.points).toBe(15)
  })

  it('does not flag orders spread over the day', () => {
    const { signals } = computeFraudRiskScore(
      base({
        previousOrderTimestamps: [
          new Date(Date.parse(T0) - 2 * DAY).toISOString(),
          new Date(Date.parse(T0) - DAY).toISOString(),
        ],
      }),
    )
    expect(signals.burst_velocity).toBeUndefined()
  })
})

describe('computeFraudRiskScore — adaptive learning', () => {
  function adaptiveFrom(orders: OrderHistoryRow[], signals: SignalHistoryRow[]) {
    return buildAdaptiveContext(orders, signals)
  }

  const fakeOrders: OrderHistoryRow[] = [
    { id: 'o1', created_at: minutesAgo(60), customer_phone: '0555123456', customer_name: 'Bot One', fraud_label: 'confirmed_fake', fraud_risk_score: 90 },
    { id: 'o2', created_at: minutesAgo(50), customer_phone: '0666123456', customer_name: 'Bot Two', fraud_label: 'confirmed_fake', fraud_risk_score: 85 },
    { id: 'o3', created_at: minutesAgo(40), customer_phone: '0770123456', customer_name: 'Bot Three', fraud_label: 'confirmed_fake', fraud_risk_score: 80 },
  ]
  const fakeSignals: SignalHistoryRow[] = [
    { order_id: 'o1', device_fingerprint: 'fp-bot-1', ip: '1.1.1.1', ip_country: null, created_at: minutesAgo(60) },
    { order_id: 'o2', device_fingerprint: 'fp-bot-2', ip: '1.1.1.1', ip_country: null, created_at: minutesAgo(50) },
    { order_id: 'o3', device_fingerprint: 'fp-bot-3', ip: '2.2.2.2', ip_country: null, created_at: minutesAgo(40) },
  ]

  it('hard-flags a device/phone from a confirmed bot cluster even outside the 24h window', () => {
    const ctx = adaptiveFrom(fakeOrders, fakeSignals)
    const { score, signals } = computeFraudRiskScore(
      base({
        deviceFingerprint: 'fp-bot-1',
        fingerprintSeenRecently: false, // last seen > 24h ago
        customerPhone: '0666000000',
        adaptive: ctx,
      }),
    )
    // This fixture's 3/3 confirmed-fake orders put the store at 100% bot
    // pressure, which scales bot_cluster from 30 to 45 (same convention as
    // every other adaptive signal in this file).
    expect(score).toBe(45)
    expect(signals.bot_cluster.points).toBe(45)
  })

  it('hard-flags a bot phone even with a fresh fingerprint', () => {
    const ctx = adaptiveFrom(fakeOrders, fakeSignals)
    const { score, signals } = computeFraudRiskScore(
      base({
        deviceFingerprint: 'fp-new-1',
        customerPhone: '0555123456',
        previousOrderTimestamps: [minutesAgo(30)],
        previousOrderPhones: ['0555123456'],
        previousOrderNames: ['Amira Benali'],
        adaptive: ctx,
      }),
    )
    expect(signals.bot_cluster.points).toBe(45)
    expect(signals.repeated_phone.points).toBe(35)
    expect(score).toBeGreaterThanOrEqual(60)
  })

  it('hard-flags a confirmed-fake IP even with a brand-new fingerprint, phone, and name (rotating-identity bot)', () => {
    const ctx = adaptiveFrom(fakeOrders, fakeSignals)
    const { score, signals } = computeFraudRiskScore(
      base({
        deviceFingerprint: 'fp-never-seen-before',
        ip: '1.1.1.1', // the IP shared by o1 and o2 above
        customerPhone: '0799888777',
        customerName: 'Someone New',
        adaptive: ctx,
      }),
    )
    expect(signals.bot_cluster.points).toBe(45)
    expect(signals.bot_cluster.detail).toContain('IP')
    expect(score).toBeGreaterThanOrEqual(45)
  })

  it('suppresses fingerprint reuse for a device proven real (returning customer)', () => {
    const ctx = adaptiveFrom(
      [
        { id: 'o1', created_at: minutesAgo(60), customer_phone: '0555123456', customer_name: 'Amira Benali', fraud_label: 'confirmed_real', fraud_risk_score: 0 },
        { id: 'o2', created_at: minutesAgo(50), customer_phone: '0666123456', customer_name: 'Sara Kaci', fraud_label: 'confirmed_real', fraud_risk_score: 0 },
        { id: 'o3', created_at: minutesAgo(40), customer_phone: '0770123456', customer_name: 'Karim Haddad', fraud_label: 'confirmed_real', fraud_risk_score: 0 },
      ],
      [
        { order_id: 'o1', device_fingerprint: 'fp-real-1', ip: '10.0.0.1', ip_country: null, created_at: minutesAgo(60) },
        { order_id: 'o2', device_fingerprint: 'fp-real-2', ip: '10.0.0.2', ip_country: null, created_at: minutesAgo(50) },
        { order_id: 'o3', device_fingerprint: 'fp-real-3', ip: '10.0.0.3', ip_country: null, created_at: minutesAgo(40) },
      ],
    )
    const { signals } = computeFraudRiskScore(
      base({
        deviceFingerprint: 'fp-real-1',
        fingerprintSeenRecently: true,
        customerPhone: '0555123456',
        customerName: 'Amira Benali',
        previousOrderTimestamps: [minutesAgo(60)],
        previousOrderPhones: ['0555123456'],
        previousOrderNames: ['Amira Benali'],
        adaptive: ctx,
      }),
    )
    expect(signals.fingerprint_reuse).toBeUndefined()
    expect(signals.repeated_phone).toBeUndefined()
    expect(Object.keys(signals)).toHaveLength(0)
  })

  it('hardens burst and datacenter signals under sustained bot pressure', () => {
    const ctx = adaptiveFrom(fakeOrders, fakeSignals)
    const { signals } = computeFraudRiskScore(
      base({
        ipIsProxyOrHosting: true,
        previousOrderTimestamps: [secondsAgo(60), secondsAgo(120)],
        adaptive: ctx,
      }),
    )
    expect(signals.datacenter_ip.points).toBe(30)
    expect(signals.burst_velocity.points).toBe(25)
  })
})

describe('computeFraudRiskScore — score aggregation', () => {
  it('caps the total at 100 when every signal fires', () => {
    const { score, signals } = computeFraudRiskScore(
      base({
        ipCountry: 'FR',
        ipIsProxyOrHosting: true,
        fingerprintSeenRecently: true,
        hadMovement: false,
        formFillMs: 300,
        previousOrderTimestamps: [secondsAgo(45), secondsAgo(90), secondsAgo(135), secondsAgo(180)],
        customerPhone: '0555123456',
        customerName: 'Amira',
        wilaya: 'Alger',
        commune: 'Fiction',
        previousOrderPhones: ['0555123456'],
        previousOrderNames: ['Amira'],
      }),
    )
    expect(score).toBe(100)
    expect(Object.keys(signals)).toHaveLength(8)
  })
})

describe('computeFraudRiskScore — evolving engine signals', () => {
  it('flags paste-driven autofill at an impossible keystroke cadence', () => {
    const { score, signals } = computeFraudRiskScore(
      base({
        behavioral: { pasteEvents: 3, avgKeyDelayMs: 15, inputEvents: 6, tabHiddenMs: 0 },
        hadMovement: false,
        formFillMs: 1100,
      }),
    )
    expect(signals.behavioral_autofill.points).toBe(25)
    expect(signals.keystroke_anomaly.points).toBe(20)
    expect(score).toBe(25 + 20)
  })

  it('flags a fast no-input autofill even without paste', () => {
    const { signals } = computeFraudRiskScore(
      base({
        behavioral: { pasteEvents: 0, avgKeyDelayMs: 8, inputEvents: 4 },
        hadMovement: false,
        formFillMs: 900,
      }),
    )
    expect(signals.behavioral_autofill).toBeDefined()
  })

  it('never flags real typing: human cadence, zero paste, movement present', () => {
    const { signals } = computeFraudRiskScore(
      base({
        behavioral: { pasteEvents: 0, avgKeyDelayMs: 240, inputEvents: 70, tabHiddenMs: 0 },
        hadMovement: true,
        formFillMs: 45000,
      }),
    )
    expect(signals.behavioral_autofill).toBeUndefined()
    expect(signals.keystroke_anomaly).toBeUndefined()
    expect(signals.hidden_tab_fill).toBeUndefined()
    expect(Object.keys(signals)).toHaveLength(0)
  })

  it('stays neutral when behavioral fields are missing entirely', () => {
    const { signals } = computeFraudRiskScore(
      base({ hadMovement: true, formFillMs: 30000 }),
    )
    expect(signals.behavioral_autofill).toBeUndefined()
    expect(signals.keystroke_anomaly).toBeUndefined()
  })

  it('flags a new-identity order that matches a learned bot strategy', () => {
    const engineCtx = buildEngineContext(
      [
        { id: 'o1', created_at: minutesAgo(60), customer_phone: '0541111111', customer_name: 'Bot One', fraud_label: 'confirmed_fake', fraud_risk_score: 90 },
        { id: 'o2', created_at: minutesAgo(50), customer_phone: '0542222222', customer_name: 'Bot Two', fraud_label: 'confirmed_fake', fraud_risk_score: 85 },
        { id: 'o3', created_at: minutesAgo(40), customer_phone: '0661111111', customer_name: 'Sara Kaci', fraud_label: 'confirmed_real', fraud_risk_score: 0 },
      ],
      [
        { order_id: 'o1', device_fingerprint: 'fp-1', ip: '10.0.0.1', ip_country: null, form_fill_ms: 1200, avg_key_delay_ms: 12, paste_events: 3, input_events: 6, tab_hidden_ms: 8000, had_movement: false },
        { order_id: 'o2', device_fingerprint: 'fp-2', ip: '10.0.0.2', ip_country: null, form_fill_ms: 1100, avg_key_delay_ms: 14, paste_events: 3, input_events: 5, tab_hidden_ms: 7000, had_movement: false },
        { order_id: 'o3', device_fingerprint: 'fp-r', ip: '10.0.0.3', ip_country: null, form_fill_ms: 50000, avg_key_delay_ms: 240, paste_events: 0, input_events: 70, tab_hidden_ms: 0, had_movement: true },
      ],
    )
    const fresh = extractFeatures(
      { id: 'new', created_at: new Date().toISOString(), customer_phone: '0779999999', customer_name: 'Kamel', fraud_label: 'pending', fraud_risk_score: null },
      { order_id: 'new', device_fingerprint: 'fp-new', ip: '10.0.0.9', ip_country: null, form_fill_ms: 1000, avg_key_delay_ms: 16, paste_events: 4, input_events: 7, tab_hidden_ms: 9000, had_movement: false },
      buildSharingAggregates(
        [
          { id: 'o1', created_at: minutesAgo(60), customer_phone: '0541111111', customer_name: 'Bot One', fraud_label: 'confirmed_fake', fraud_risk_score: 90 },
          { id: 'o2', created_at: minutesAgo(50), customer_phone: '0542222222', customer_name: 'Bot Two', fraud_label: 'confirmed_fake', fraud_risk_score: 85 },
          { id: 'o3', created_at: minutesAgo(40), customer_phone: '0661111111', customer_name: 'Sara Kaci', fraud_label: 'confirmed_real', fraud_risk_score: 0 },
        ],
        [
          { order_id: 'o1', device_fingerprint: 'fp-1', ip: '10.0.0.1', ip_country: null },
          { order_id: 'o2', device_fingerprint: 'fp-2', ip: '10.0.0.2', ip_country: null },
          { order_id: 'o3', device_fingerprint: 'fp-r', ip: '10.0.0.3', ip_country: null },
        ],
      ),
      [
        { id: 'o1', created_at: minutesAgo(60), customer_phone: '0541111111', customer_name: 'Bot One', fraud_label: 'confirmed_fake', fraud_risk_score: 90 },
        { id: 'o2', created_at: minutesAgo(50), customer_phone: '0542222222', customer_name: 'Bot Two', fraud_label: 'confirmed_fake', fraud_risk_score: 85 },
        { id: 'o3', created_at: minutesAgo(40), customer_phone: '0661111111', customer_name: 'Sara Kaci', fraud_label: 'confirmed_real', fraud_risk_score: 0 },
      ],
    )
    const { score, signals } = computeFraudRiskScore(
      base({
        customerPhone: '0779999999',
        customerName: 'Kamel',
        behavioral: { pasteEvents: 4, avgKeyDelayMs: 16, inputEvents: 7, tabHiddenMs: 9000 },
        hadMovement: false,
        formFillMs: 1000,
        engine: engineCtx,
        features: fresh,
      }),
    )
    expect(signals.attack_profile_match).toBeDefined()
    expect(signals.attack_profile_match!.points).toBe(30)
    expect(score).toBeGreaterThanOrEqual(30)
  })

  it('flags a learned bot phone prefix pool', () => {
    const { signals } = computeFraudRiskScore(
      base({
        customerPhone: '0549876543',
        engine: { ...buildEngineContext([], []), botPhonePrefixes: ['054'] },
      }),
    )
    expect(signals.phone_prefix_pool.points).toBe(12)
  })
})
