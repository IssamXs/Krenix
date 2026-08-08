import { describe, it, expect, vi, beforeEach } from 'vitest'

const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...args: unknown[]) => createMock(...args) }
  },
}))

import {
  parseResponse,
  normalizeStoredResult,
  buildPrompt,
  aiScanOrdersBatched,
  SCAN_BATCH_SIZE,
  type AiScanOrder,
  type AiScanContextOrder,
} from './ai-scan'
import { buildEngineContext } from './engine'

function order(id: string): AiScanOrder {
  return {
    id,
    order_number: `K-${id}`,
    customer_name: 'Amira',
    customer_phone: '0555123456',
    wilaya: 'Alger',
    commune: 'Alger Centre',
    quantity: 1,
    unit_price: 1000,
    delivery_price: 500,
    total_price: 1500,
    delivery_type: 'home',
    status: 'pending',
    source: 'form',
    notes: null,
    created_at: '2026-08-05T12:00:00.000Z',
    product_name: 'Produit',
    fraud_label: null,
    device_fingerprint: 'fp-1',
    fraud_risk_score: null,
    fraud_signals: null,
  }
}

function successResponse(content: string) {
  const ids = [...content.matchAll(/\(id: ([^)]+)\)/g)].map(m => m[1])
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ orders: ids.map(id => ({ id, verdict: 'real', riskScore: 5, reasons: [], summary: '' })) }),
    }],
  }
}

beforeEach(() => {
  createMock.mockReset()
  createMock.mockImplementation(async ({ messages }: { messages: { content: string }[] }) =>
    successResponse(messages[0].content),
  )
})

describe('parseResponse', () => {
  const orders = [order('a'), order('b'), order('c')]

  it('parses a plain JSON response', () => {
    const text = JSON.stringify({
      orders: [
        { id: 'a', verdict: 'fake', riskScore: 85, reasons: ['Téléphone suspect'], summary: 'Fausse' },
        { id: 'b', verdict: 'real', riskScore: 5, reasons: [], summary: 'Réelle' },
      ],
    })
    const results = parseResponse(text, orders)
    expect(results).toHaveLength(3)
    expect(results[0]).toMatchObject({ id: 'a', verdict: 'fake', riskScore: 85 })
    expect(results[0].cached).toBeUndefined()
  })

  it('strips markdown fences', () => {
    const text = '```json\n' + JSON.stringify({ orders: [{ id: 'a', verdict: 'real', riskScore: 0, reasons: [], summary: '' }] }) + '\n```'
    const results = parseResponse(text, orders)
    expect(results[0].verdict).toBe('real')
  })

  it('drops ids Claude does not know about', () => {
    const text = JSON.stringify({ orders: [{ id: 'unknown', verdict: 'fake', riskScore: 90, reasons: [], summary: '' }] })
    const results = parseResponse(text, orders)
    expect(results).toHaveLength(3)
    expect(results.every(r => r.id !== 'unknown')).toBe(true)
  })

  it('fills missing orders as suspicious instead of dropping them', () => {
    const text = JSON.stringify({ orders: [{ id: 'a', verdict: 'real', riskScore: 5, reasons: [], summary: '' }] })
    const results = parseResponse(text, orders)
    expect(results.map(r => r.id).sort()).toEqual(['a', 'b', 'c'])
    const fallback = results.find(r => r.id === 'b')
    expect(fallback?.verdict).toBe('suspicious')
    expect(fallback?.riskScore).toBe(30)
  })

  it('coerces bad verdicts and clamps the risk score', () => {
    const text = JSON.stringify({ orders: [{ id: 'a', verdict: 'banana', riskScore: 250, reasons: ['x'], summary: '' }] })
    const results = parseResponse(text, orders)
    expect(results[0].verdict).toBe('suspicious')
    expect(results[0].riskScore).toBe(100)
  })
})

describe('normalizeStoredResult', () => {
  it('rebuilds a result from a cache row with the cached flags set', () => {
    const result = normalizeStoredResult({
      order_id: 'a',
      verdict: 'fake',
      risk_score: 80,
      reasons: ['Signal 1', 'Signal 2'],
      summary: 'Fausse commande',
      scanned_at: '2026-08-05T12:00:00.000Z',
    })
    expect(result).toEqual({
      id: 'a',
      verdict: 'fake',
      riskScore: 80,
      reasons: ['Signal 1', 'Signal 2'],
      summary: 'Fausse commande',
      cached: true,
      scannedAt: '2026-08-05T12:00:00.000Z',
    })
  })

  it('normalizes corrupt cache rows the same way as parseResponse', () => {
    const result = normalizeStoredResult({
      order_id: 'b',
      verdict: 'nope',
      risk_score: 150,
      reasons: null,
      summary: null,
      scanned_at: '2026-08-05T12:00:00.000Z',
    })
    expect(result.verdict).toBe('suspicious')
    expect(result.riskScore).toBe(100)
    expect(result.reasons).toEqual([])
    expect(result.summary).toBe('')
  })
})

describe('buildPrompt', () => {
  it('explicitly says a first-name-only customer is never suspicious', () => {
    const prompt = buildPrompt([order('a')], [])
    expect(prompt).toContain('prénom seul')
    expect(prompt).not.toContain('mots uniques')
    expect(prompt).toContain('n\'est JAMAIS un signal de fraude')
  })

  it('includes the merchant feedback (fraud_label) per order', () => {
    const withLabel = order('a')
    withLabel.fraud_label = 'confirmed_fake'
    const prompt = buildPrompt([withLabel], [])
    expect(prompt).toContain('label marchand: confirmed_fake')
  })

  it('includes learned intelligence only when confirmed fakes exist', () => {
    const noIntel = buildPrompt([order('a')], [])
    expect(noIntel).toContain('pas encore de fausse commande confirmée')

    const withIntel = buildPrompt([order('a')], [], {
      confirmedFake: 3,
      confirmedReal: 1,
      botPressure: 0.75,
      botFingerprints: ['fp-bot-1'],
      botPhones: ['0555123456'],
    })
    expect(withIntel).toContain('Commandes confirmées FAUSSES par le marchand: 3')
    expect(withIntel).toContain('fp-bot-1')
    expect(withIntel).toContain('0555123456')
  })

  it('marks confirmed labels in the recent-orders context', () => {
    const prompt = buildPrompt([order('a')], [
      {
        id: 'ctx1',
        order_number: 'K-9',
        customer_name: 'Bot X',
        customer_phone: '0666123456',
        wilaya: 'Alger',
        created_at: '2026-08-05T11:00:00.000Z',
        fraud_label: 'confirmed_fake',
      },
    ])
    expect(prompt).toContain('confirmed_fake')
  })

  it('shows the delivery fee per order so the total can be verified', () => {
    const prompt = buildPrompt([order('a')], [])
    expect(prompt).toContain('delivery: 500 DZD')
    expect(prompt).toContain('total = quantité × prix unitaire + frais de livraison')
    expect(prompt).toContain('1600 DZD + 500 DZD de livraison = 2100 DZD')
  })

  it('never treats the missing address as suspicious (the form has no address field)', () => {
    const prompt = buildPrompt([order('a')], [])
    expect(prompt).not.toContain('Adresse vide')
    expect(prompt).toContain('NE collecte PAS d\'adresse')
    expect(prompt).toContain('ne doit JAMAIS être un signal de fraude')
  })

  it('warns the AI that a polite note / stop-desk / valid fields prove nothing', () => {
    const prompt = buildPrompt([order('a')], [])
    expect(prompt).toContain('L\'APPEARANCE NE PROUVE RIEN')
    expect(prompt).toContain('une note polie, un stop-desk, un téléphone valide')
    expect(prompt).toContain('ne doivent jamais être cités comme raison de dire "real"')
    expect(prompt).toContain('une note absente OU polie est NEUTRE')
  })

  it('flags a bot wave via the cadence block (many orders in the last hour)', () => {
    const t = Date.now()
    const make = (id: string, offsetMin: number): AiScanContextOrder => ({
      id,
      order_number: `K-${id}`,
      customer_name: 'Bot X',
      customer_phone: `06${String(10000000 + Number(id) * 100000).slice(0, 8)}`,
      wilaya: 'Alger',
      created_at: new Date(t - offsetMin * 60000).toISOString(),
      fraud_label: null,
      device_fingerprint: `fp-${id}`,
    })
    const context = Array.from({ length: 20 }, (_, i) => make(`c${i}`, 2 + i * 3))
    const prompt = buildPrompt([{ ...order('a'), created_at: new Date(t - 120000).toISOString() }], context)
    expect(prompt).toContain('RAFALE: 21 commandes enregistrées dans la dernière heure')
  })

  it('surfaces repeated devices/phones in the cadence block', () => {
    const t = Date.now()
    const context: AiScanContextOrder[] = [
      { id: 'c1', order_number: 'K-c1', customer_name: 'A', customer_phone: '0555000001', wilaya: 'Alger', created_at: new Date(t - 600000).toISOString(), fraud_label: null, device_fingerprint: 'aaaa0000aaaa0000aaaa0000aaaa0000' },
      { id: 'c2', order_number: 'K-c2', customer_name: 'B', customer_phone: '0555000002', wilaya: 'Alger', created_at: new Date(t - 300000).toISOString(), fraud_label: null, device_fingerprint: 'aaaa0000aaaa0000aaaa0000aaaa0000' },
    ]
    const prompt = buildPrompt([order('a')], context)
    expect(prompt).toContain('empreintes réutilisées')
    expect(prompt).toContain('(x2)')
  })

  it('does not let a dropdown-valid commune count as proof of a real order', () => {
    const prompt = buildPrompt([order('a')], [])
    expect(prompt).toContain('MENU DÉROULANT lié à la wilaya')
    expect(prompt).toContain('ne prouve NI l\'authenticité NI la fraude')
    expect(prompt).toContain('Ne cite jamais « commune valide pour cette wilaya »')
  })

  it('shows behavioral and IP signals per order so the AI can weigh them', () => {
    const withBehavior = order('a')
    withBehavior.time_on_page_ms = 48000
    withBehavior.form_fill_ms = 31000
    withBehavior.had_movement = true
    withBehavior.ip_country = 'DZ'
    withBehavior.ip_is_proxy_or_hosting = false
    const prompt = buildPrompt([withBehavior], [])
    expect(prompt).toContain('comportement: page 48s | remplissage 31s | souris oui')
    expect(prompt).toContain('ip: DZ')
  })

  it('marks a bot-like instant fill with no mouse movement as suspect', () => {
    const botLike = order('a')
    botLike.form_fill_ms = 850
    botLike.had_movement = false
    const prompt = buildPrompt([botLike], [])
    expect(prompt).toContain('remplissage 850ms')
    expect(prompt).toContain('souris non')
    expect(prompt).toContain('< 1 seconde SANS aucun mouvement de souris = autofill de bot')
    expect(prompt).toContain('une IP étrangère/proxy')
  })

  it('shows the rich behavioral capture (paste, keystroke cadence, hidden tab) per order', () => {
    const rich = order('a')
    rich.paste_events = 3
    rich.avg_key_delay_ms = 15
    rich.input_events = 6
    rich.tab_hidden_ms = 8000
    const prompt = buildPrompt([rich], [])
    expect(prompt).toContain('saisie 6 | collage 3 | cadence 15ms | onglet caché 8s')
  })

  it('surfaces IP reuse across many orders in the cadence block', () => {
    const t = Date.now()
    const orders = [0, 1, 2].map(i => ({
      ...order(`c${i}`),
      ip: '154.243.186.139',
      created_at: new Date(t - i * 60000).toISOString(),
    }))
    const prompt = buildPrompt(orders, [])
    expect(prompt).toContain('IP réutilisées')
    expect(prompt).toContain('(x3)')
  })

  it('injects the learned engine model so Claude judges against this store\'s bot', () => {
    const ctx = buildEngineContext(
      [
        { id: 'o1', created_at: '2026-08-05T10:00:00.000Z', customer_phone: '0541111111', customer_name: 'Bot One', fraud_label: 'confirmed_fake', fraud_risk_score: 90 },
        { id: 'o2', created_at: '2026-08-05T10:05:00.000Z', customer_phone: '0542222222', customer_name: 'Bot Two', fraud_label: 'confirmed_fake', fraud_risk_score: 85 },
        { id: 'o3', created_at: '2026-08-05T12:00:00.000Z', customer_phone: '0661111111', customer_name: 'Sara Kaci', fraud_label: 'confirmed_real', fraud_risk_score: 0 },
      ],
      [
        { order_id: 'o1', device_fingerprint: 'fp-1', ip: '10.0.0.1', ip_country: null, form_fill_ms: 1200, avg_key_delay_ms: 12, paste_events: 3, input_events: 6, tab_hidden_ms: 8000, had_movement: false },
        { order_id: 'o2', device_fingerprint: 'fp-2', ip: '10.0.0.2', ip_country: null, form_fill_ms: 1100, avg_key_delay_ms: 14, paste_events: 3, input_events: 5, tab_hidden_ms: 7000, had_movement: false },
        { order_id: 'o3', device_fingerprint: 'fp-r', ip: '10.0.0.3', ip_country: null, form_fill_ms: 50000, avg_key_delay_ms: 240, paste_events: 0, input_events: 70, tab_hidden_ms: 0, had_movement: true },
      ],
    )
    const prompt = buildPrompt([order('a')], [], {
      confirmedFake: 2,
      confirmedReal: 1,
      botPressure: 0.5,
      botFingerprints: ['fp-1'],
      botPhones: ['0541111111'],
      engine: ctx,
    })
    expect(prompt).toContain('MOTEUR DE DÉTECTION')
    expect(prompt).toContain('Base apprise: 2 fausse(s)')
    expect(prompt).toContain('Stratégie bot')
    expect(prompt).toContain('Le modèle appris a toujours préséance sur l\'apparence')
  })

  it('warns that matching the learned model beats surface realism', () => {
    const prompt = buildPrompt([order('a')], [])
    expect(prompt).toContain('MOTEUR DE DÉTECTION')
    expect(prompt).toContain('boutique sans modèle appris')
  })
})

describe('aiScanOrdersBatched', () => {
  it('splits a large selection into small batches', async () => {
    const orders = Array.from({ length: SCAN_BATCH_SIZE * 2 + 2 }, (_, i) => order(`id-${i}`))
    const results = await aiScanOrdersBatched(orders, [])
    expect(createMock).toHaveBeenCalledTimes(3) // 10 + 10 + 2
    expect(results).toHaveLength(SCAN_BATCH_SIZE * 2 + 2)
    expect(results.every(r => r.verdict === 'real')).toBe(true)
  })

  it('keeps every order even when one batch fails', async () => {
    createMock.mockRejectedValueOnce(new Error('token budget exceeded'))
    const orders = Array.from({ length: SCAN_BATCH_SIZE + 2 }, (_, i) => order(`id-${i}`))
    const results = await aiScanOrdersBatched(orders, [])
    expect(createMock).toHaveBeenCalledTimes(2)
    expect(results).toHaveLength(SCAN_BATCH_SIZE + 2)
    const failed = results.filter(r => r.verdict === 'suspicious')
    expect(failed).toHaveLength(SCAN_BATCH_SIZE)
    expect(failed[0].riskScore).toBe(30)
  })
})
