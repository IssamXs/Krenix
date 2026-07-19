import { describe, it, expect, vi, afterEach } from 'vitest'
import { postOrderToSheet, type SheetOrderPayload } from '@/lib/sheets'

const payload: SheetOrderPayload = {
  order_number: 'TEST-0001',
  name: 'Client Test',
  phone: '0555 00 00 00',
  wilaya: 'Alger',
  commune: 'Alger Centre',
  product: 'Produit de test',
  quantity: 1,
  total: 2500,
  status: 'pending',
  source: 'test',
  date: new Date().toISOString(),
}

function mockFetch(status: number, contentType: string, body: string) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    text: () => Promise.resolve(body),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('postOrderToSheet', () => {
  it('returns false when the Apps Script itself caught an exception (200 + {ok:false})', async () => {
    // This is exactly what our shipped Apps Script (sheets-apps-script.ts) sends
    // when doPost's try/catch swallows a script-side error: HTTP 200, JSON body,
    // but ok:false. A real order never reaches the sheet in this case.
    vi.stubGlobal('fetch', mockFetch(200, 'application/json; charset=utf-8', JSON.stringify({ ok: false, error: 'Exception: You do not have permission to call SpreadsheetApp.getActiveSpreadsheet' })))
    const result = await postOrderToSheet('https://script.google.com/macros/s/fake/exec', payload)
    expect(result).toBe(false)
  })

  it('returns true when the Apps Script reports success (200 + {ok:true})', async () => {
    vi.stubGlobal('fetch', mockFetch(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true })))
    const result = await postOrderToSheet('https://script.google.com/macros/s/fake/exec', payload)
    expect(result).toBe(true)
  })

  it('returns true for third-party hooks (Zapier/Make) that reply 2xx with no {ok} field', async () => {
    vi.stubGlobal('fetch', mockFetch(200, 'application/json', JSON.stringify({ status: 'accepted' })))
    const result = await postOrderToSheet('https://hooks.zapier.com/fake', payload)
    expect(result).toBe(true)
  })

  it('returns false on a non-2xx response', async () => {
    vi.stubGlobal('fetch', mockFetch(500, 'text/plain', 'server error'))
    const result = await postOrderToSheet('https://script.google.com/macros/s/fake/exec', payload)
    expect(result).toBe(false)
  })

  it('returns false when the response is an HTML sign-in redirect', async () => {
    vi.stubGlobal('fetch', mockFetch(200, 'text/html; charset=UTF-8', '<html>Sign in</html>'))
    const result = await postOrderToSheet('https://script.google.com/macros/s/fake/exec', payload)
    expect(result).toBe(false)
  })
})
