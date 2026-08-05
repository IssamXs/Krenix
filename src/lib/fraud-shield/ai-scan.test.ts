import { describe, it, expect } from 'vitest'
import { parseResponse, normalizeStoredResult, type AiScanOrder } from './ai-scan'

function order(id: string): AiScanOrder {
  return {
    id,
    order_number: `K-${id}`,
    customer_name: 'Amira',
    customer_phone: '0555123456',
    wilaya: 'Alger',
    commune: 'Alger Centre',
    address: null,
    quantity: 1,
    unit_price: 1000,
    total_price: 1000,
    delivery_type: 'home',
    status: 'pending',
    source: 'form',
    notes: null,
    created_at: '2026-08-05T12:00:00.000Z',
    product_name: 'Produit',
    fraud_risk_score: null,
    fraud_signals: null,
  }
}

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
