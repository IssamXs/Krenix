import { describe, it, expect } from 'vitest'
import {
  buildEngineContext,
  extractFeatures,
  buildSharingAggregates,
  fillSpeedBucket,
  keyCadenceBucket,
  pasteUsageBucket,
  inputVolumeBucket,
  hourBandBucket,
  nameShapeBucket,
  phonePrefixBucket,
  noteStyleBucket,
  matchAttackProfiles,
  buildEngineIntelligenceBlock,
  type EngineOrderRow,
  type EngineSignalRow,
} from './engine'

function order(partial: Partial<EngineOrderRow> & { id: string }): EngineOrderRow {
  return {
    created_at: '2026-08-05T12:00:00.000Z',
    customer_phone: '0555123456',
    customer_name: 'Amira Benali',
    fraud_label: null,
    fraud_risk_score: null,
    ...partial,
  }
}

function signal(partial: Partial<EngineSignalRow> & { order_id: string }): EngineSignalRow {
  return {
    device_fingerprint: null,
    ip: '1.2.3.4',
    ip_country: 'DZ',
    ...partial,
  }
}

const BOT_FEATURES = {
  form_fill_ms: 1200,
  avg_key_delay_ms: 12,
  paste_events: 3,
  input_events: 6,
  tab_hidden_ms: 8000,
  had_movement: false,
}

function fakeBotOrder(id: string, phone: string, created: string): EngineOrderRow {
  return order({ id, customer_phone: phone, customer_name: 'Bot One', fraud_label: 'confirmed_fake', created_at: created })
}

describe('bucket helpers', () => {
  it('buckets fill speed', () => {
    expect(fillSpeedBucket(400)).toBe('instant')
    expect(fillSpeedBucket(2000)).toBe('quick')
    expect(fillSpeedBucket(7000)).toBe('normal')
    expect(fillSpeedBucket(20000)).toBe('slow')
    expect(fillSpeedBucket(60000)).toBe('very_slow')
    expect(fillSpeedBucket(null)).toBe('unknown')
  })

  it('buckets keystroke cadence', () => {
    expect(keyCadenceBucket(15)).toBe('instant')
    expect(keyCadenceBucket(70)).toBe('fast')
    expect(keyCadenceBucket(250)).toBe('human')
    expect(keyCadenceBucket(900)).toBe('slow')
    expect(keyCadenceBucket(null)).toBe('unknown')
  })

  it('buckets paste usage and input volume', () => {
    expect(pasteUsageBucket(0)).toBe('none')
    expect(pasteUsageBucket(1)).toBe('partial')
    expect(pasteUsageBucket(4)).toBe('heavy')
    expect(inputVolumeBucket(1)).toBe('none')
    expect(inputVolumeBucket(7)).toBe('low')
    expect(inputVolumeBucket(25)).toBe('normal')
    expect(inputVolumeBucket(80)).toBe('high')
  })

  it('derives the DZ hour band and name shape', () => {
    // 12:00 UTC = 13:00 DZ → afternoon
    expect(hourBandBucket('2026-08-05T12:00:00.000Z')).toBe('afternoon')
    expect(hourBandBucket('2026-08-05T23:00:00.000Z')).toBe('night')
    expect(nameShapeBucket('Amira')).toBe('first_only')
    expect(nameShapeBucket('Amira Benali')).toBe('two_words')
    expect(nameShapeBucket('Amira Benali Kaci')).toBe('three_plus')
    expect(nameShapeBucket('zzzzz')).toBe('weird')
    expect(phonePrefixBucket('0770123456')).toBe('077')
    expect(phonePrefixBucket('zzz')).toBe('invalid')
  })

  it('detects suspicious vs polite vs neutral notes', () => {
    expect(noteStyleBucket(null)).toBe('none')
    expect(noteStyleBucket('merci beaucoup')).toBe('polite')
    expect(noteStyleBucket('ok')).toBe('short_neutral')
    expect(noteStyleBucket('visitez https://spam.com')).toBe('suspicious')
    expect(noteStyleBucket('aaaaaaaaaa')).toBe('suspicious')
  })
})

describe('buildEngineContext — learning from merchant ground truth only', () => {
  it('computes fake-share per feature value from confirmed labels', () => {
    const orders = [
      fakeBotOrder('a', '0541111111', '2026-08-05T10:00:00.000Z'),
      fakeBotOrder('b', '0542222222', '2026-08-05T10:05:00.000Z'),
      order({ id: 'c', customer_phone: '0661111111', customer_name: 'Sara Kaci', fraud_label: 'confirmed_real' }),
      order({ id: 'd', customer_phone: '0662222222', customer_name: 'Lina', fraud_label: 'confirmed_real' }),
    ]
    const signals = [
      signal({ order_id: 'a', ...BOT_FEATURES, ip: '10.0.0.1' }),
      signal({ order_id: 'b', ...BOT_FEATURES, ip: '10.0.0.2' }),
      signal({ order_id: 'c', form_fill_ms: 15000, avg_key_delay_ms: 220, paste_events: 0, input_events: 60, had_movement: true }),
      signal({ order_id: 'd', form_fill_ms: 20000, avg_key_delay_ms: 180, paste_events: 0, input_events: 40, had_movement: true }),
    ]
    const ctx = buildEngineContext(orders, signals)

    expect(ctx.sampleFake).toBe(2)
    expect(ctx.sampleReal).toBe(2)

    // Fast fill is 100% fake here (2/2), while slow fill is 0% fake.
    expect(ctx.featureStats.fill_speed.quick.fake).toBe(2)
    expect(ctx.featureStats.fill_speed.quick.real).toBe(0)
    expect(ctx.featureStats.fill_speed.slow.fake).toBe(0)
    expect(ctx.featureStats.fill_speed.slow.real).toBe(2)

    // Human keystroke cadence never seen on fakes.
    expect(ctx.featureStats.key_cadence.instant.fake).toBe(2)
    expect(ctx.featureStats.key_cadence.human.fake).toBe(0)

    // Prefix pools learned from confirmed fakes only.
    expect(ctx.botPhonePrefixes).toContain('054')
    expect(ctx.botPhonePrefixes).not.toContain('066')
  })

  it('never learns from unconfirmed high-risk orders (no self-reinforcement)', () => {
    const orders = [
      order({ id: 'a', fraud_label: 'pending', fraud_risk_score: 95 }),
      order({ id: 'b', fraud_label: 'pending', fraud_risk_score: 90 }),
    ]
    const signals = [
      signal({ order_id: 'a', ...BOT_FEATURES }),
      signal({ order_id: 'b', ...BOT_FEATURES }),
    ]
    const ctx = buildEngineContext(orders, signals)
    expect(ctx.sampleFake).toBe(0)
    expect(ctx.attackProfiles).toHaveLength(0)
    expect(ctx.botPhonePrefixes).toHaveLength(0)
    expect(buildEngineIntelligenceBlock(ctx)).toContain('modèle non entraîné')
  })

  it('learns an attack profile that a fresh-identity wave still matches', () => {
    const orders = [
      fakeBotOrder('a', '0541111111', '2026-08-05T10:00:00.000Z'),
      fakeBotOrder('b', '0542222222', '2026-08-05T10:05:00.000Z'),
      fakeBotOrder('c', '0543333333', '2026-08-05T10:10:00.000Z'),
      order({ id: 'r', customer_phone: '0661111111', customer_name: 'Sara Kaci', fraud_label: 'confirmed_real' }),
    ]
    const signals = [
      signal({ order_id: 'a', ...BOT_FEATURES, ip: '10.0.0.1', device_fingerprint: 'fp-1' }),
      signal({ order_id: 'b', ...BOT_FEATURES, ip: '10.0.0.2', device_fingerprint: 'fp-2' }),
      signal({ order_id: 'c', ...BOT_FEATURES, ip: '10.0.0.3', device_fingerprint: 'fp-3' }),
      signal({ order_id: 'r', form_fill_ms: 50000, avg_key_delay_ms: 240, paste_events: 0, input_events: 70, had_movement: true }),
    ]
    const ctx = buildEngineContext(orders, signals)

    expect(ctx.attackProfiles.length).toBeGreaterThan(0)

    // A NEW order: brand-new phone, brand-new fingerprint, brand-new IP — but
    // the SAME behavior. The strategy must still match.
    const freshAgg = buildSharingAggregates(orders, signals)
    const freshFeatures = extractFeatures(
      order({ id: 'new', customer_phone: '0779999999', customer_name: 'Kamel', fraud_label: 'pending' }),
      signal({ order_id: 'new', ...BOT_FEATURES, ip: '10.0.0.9', device_fingerprint: 'fp-new' }),
      freshAgg,
      orders,
    )
    const match = matchAttackProfiles(freshFeatures, ctx.attackProfiles)
    expect(match).not.toBeNull()
    expect(match!.similarity).toBeGreaterThanOrEqual(0.6)
  })

  it('does not match a profile when the behavior is clearly human', () => {
    const orders = [
      fakeBotOrder('a', '0541111111', '2026-08-05T10:00:00.000Z'),
      fakeBotOrder('b', '0542222222', '2026-08-05T10:05:00.000Z'),
      order({ id: 'r', customer_phone: '0661111111', customer_name: 'Sara Kaci', fraud_label: 'confirmed_real' }),
    ]
    const signals = [
      signal({ order_id: 'a', ...BOT_FEATURES }),
      signal({ order_id: 'b', ...BOT_FEATURES }),
      signal({ order_id: 'r', form_fill_ms: 50000, avg_key_delay_ms: 240, paste_events: 0, input_events: 70, had_movement: true }),
    ]
    const ctx = buildEngineContext(orders, signals)

    const humanFeatures = extractFeatures(
      order({ id: 'h', customer_phone: '0665555555', customer_name: 'Sara Kaci', fraud_label: 'pending' }),
      signal({ order_id: 'h', form_fill_ms: 60000, avg_key_delay_ms: 280, paste_events: 0, input_events: 90, tab_hidden_ms: 0, had_movement: true }),
      buildSharingAggregates(orders, signals),
      orders,
    )
    expect(matchAttackProfiles(humanFeatures, ctx.attackProfiles)).toBeNull()
  })

  it('renders a readable intelligence block for the AI', () => {
    const orders = [
      fakeBotOrder('a', '0541111111', '2026-08-05T10:00:00.000Z'),
      fakeBotOrder('b', '0542222222', '2026-08-05T10:05:00.000Z'),
      order({ id: 'r', customer_phone: '0661111111', customer_name: 'Sara Kaci', fraud_label: 'confirmed_real' }),
    ]
    const signals = [
      signal({ order_id: 'a', ...BOT_FEATURES }),
      signal({ order_id: 'b', ...BOT_FEATURES }),
      signal({ order_id: 'r', form_fill_ms: 50000, avg_key_delay_ms: 240, paste_events: 0, input_events: 70, had_movement: true }),
    ]
    const ctx = buildEngineContext(orders, signals)
    const block = buildEngineIntelligenceBlock(ctx)
    expect(block).toContain('Base apprise: 2 fausse(s) / 1 réelle(s)')
    expect(block).toContain('vitesse de remplissage')
    expect(block).toContain('Stratégie bot')
  })

  it('keeps the model empty for a brand-new store', () => {
    const ctx = buildEngineContext([], [])
    expect(ctx.sampleFake).toBe(0)
    expect(ctx.attackProfiles).toHaveLength(0)
  })
})
