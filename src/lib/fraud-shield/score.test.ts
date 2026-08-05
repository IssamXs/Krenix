import { describe, it, expect } from 'vitest'
import { computeFraudRiskScore, type FraudSignalInputs } from './score'

const T0 = '2026-08-05T12:00:00.000Z'
const HOUR = 3600_000
const DAY = 24 * HOUR

function base(overrides: Partial<FraudSignalInputs> = {}): FraudSignalInputs {
  return {
    ipCountry: null,
    ipIsProxyOrHosting: false,
    fingerprintSeenRecently: false,
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
    expect(score).toBe(25 + 30 + 10)
    expect(signals.datacenter_ip.points).toBe(25)
    expect(signals.fingerprint_reuse.points).toBe(30)
    expect(signals.ip_country_mismatch.points).toBe(10)
  })

  it('flags no human behavior on a sub-1.5s form fill without movement', () => {
    const { signals } = computeFraudRiskScore(base({ hadMovement: false, formFillMs: 400 }))
    expect(signals.no_human_behavior.points).toBe(15)
  })

  it('does not flag slow fills even without movement', () => {
    const { signals } = computeFraudRiskScore(base({ hadMovement: false, formFillMs: 5000 }))
    expect(signals.no_human_behavior).toBeUndefined()
  })
})

describe('computeFraudRiskScore — timing', () => {
  it('flags a regular inter-order interval', () => {
    const { signals } = computeFraudRiskScore(
      base({
        previousOrderTimestamps: [
          minutesAgo(1),
          minutesAgo(2),
          minutesAgo(3),
          minutesAgo(4),
        ],
      }),
    )
    expect(signals.timing_regularity.points).toBe(20)
  })

  it('does not flag irregular spacing', () => {
    const { signals } = computeFraudRiskScore(
      base({
        previousOrderTimestamps: [
          minutesAgo(3),
          minutesAgo(10),
          minutesAgo(45),
          minutesAgo(240),
        ],
      }),
    )
    expect(signals.timing_regularity).toBeUndefined()
  })
})

describe('computeFraudRiskScore — repeat phone/name', () => {
  it('flags a phone reused by a recent order', () => {
    const { score, signals } = computeFraudRiskScore(
      base({
        customerPhone: '0555123456',
        previousOrderTimestamps: [minutesAgo(30), minutesAgo(60)],
        previousOrderPhones: ['0555123456', '0666123456'],
      }),
    )
    expect(score).toBe(25)
    expect(signals.repeated_phone.points).toBe(25)
    expect(signals.repeated_identity).toBeUndefined()
  })

  it('normalizes +213 and spaced phone variants before matching', () => {
    const { signals } = computeFraudRiskScore(
      base({
        customerPhone: '+213 770 12 34 56',
        previousOrderTimestamps: [minutesAgo(30)],
        previousOrderPhones: ['0770123456'],
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

  it('flags a repeated name with a different phone', () => {
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

  it('only flags repeated phone (not identity) when both match', () => {
    const { signals } = computeFraudRiskScore(
      base({
        customerName: 'Amira',
        customerPhone: '0555123456',
        previousOrderTimestamps: [minutesAgo(30)],
        previousOrderNames: ['Amira'],
        previousOrderPhones: ['0555123456'],
      }),
    )
    expect(signals.repeated_phone).toBeDefined()
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
    const { signals } = computeFraudRiskScore(
      base({ wilaya: 'Sétif', commune: 'Setif' }),
    )
    expect(signals.wilaya_commune_mismatch).toBeUndefined()
  })

  it('resolves alternate wilaya spellings', () => {
    const { signals } = computeFraudRiskScore(
      base({ wilaya: 'Setif', commune: 'El Eulma' }),
    )
    expect(signals.wilaya_commune_mismatch).toBeUndefined()
  })

  it('skips wilayas without commune data', () => {
    const { signals } = computeFraudRiskScore(
      base({ wilaya: 'Illizi', commune: 'Fiction' }),
    )
    expect(signals.wilaya_commune_mismatch).toBeUndefined()
  })
})

describe('computeFraudRiskScore — burst velocity', () => {
  it('flags several orders within a few minutes', () => {
    const { score, signals } = computeFraudRiskScore(
      base({
        previousOrderTimestamps: [secondsAgo(90), secondsAgo(120), secondsAgo(150)],
      }),
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

describe('computeFraudRiskScore — score aggregation', () => {
  it('caps the total at 100 when every signal fires', () => {
    const { score, signals } = computeFraudRiskScore(
      base({
        ipCountry: 'FR',
        ipIsProxyOrHosting: true,
        fingerprintSeenRecently: true,
        hadMovement: false,
        formFillMs: 300,
        previousOrderTimestamps: [
          secondsAgo(45),
          secondsAgo(90),
          secondsAgo(135),
          secondsAgo(180),
        ],
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
