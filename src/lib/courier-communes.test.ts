import { describe, it, expect, vi, afterEach } from 'vitest'
import { bestCommuneMatch, resolveCourierDestination } from './courier-communes'

const ALGER_COMMUNES = [
  'Alger Centre', 'Bab Ezzouar', 'Bir Mourad Rais', 'Hussein Dey', 'Aïn Taya', 'Kouba',
]

function feesResponse(toWilayaName: string, communes: string[]) {
  const perCommune: Record<string, { commune_name: string; express_home: number; express_desk: number }> = {}
  for (const name of communes) perCommune[name] = { commune_name: name, express_home: 500, express_desk: 350 }
  return { ok: true, json: async () => ({ to_wilaya_name: toWilayaName, per_commune: perCommune }) }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('bestCommuneMatch', () => {
  it('returns the exact candidate when spellings already match', () => {
    expect(bestCommuneMatch(ALGER_COMMUNES, 'Bab Ezzouar')).toBe('Bab Ezzouar')
  })

  it('resolves accent/case/hyphen variants to the canonical form', () => {
    // The order stores the CSV spelling "Ain Taya"; Yalidine wants "Aïn Taya".
    expect(bestCommuneMatch(ALGER_COMMUNES, 'Ain Taya')).toBe('Aïn Taya')
    expect(bestCommuneMatch(['Khemis Miliana'], 'Khemis-Miliana')).toBe('Khemis Miliana')
    expect(bestCommuneMatch(ALGER_COMMUNES, 'ain taya')).toBe('Aïn Taya')
  })

  it('matches a prefix of a long enough commune name', () => {
    expect(bestCommuneMatch(ALGER_COMMUNES, 'Bab Ezzou')).toBe('Bab Ezzouar')
  })

  it('tolerates small typos (edit distance ≤ 2)', () => {
    expect(bestCommuneMatch(ALGER_COMMUNES, 'Hussein Deyy')).toBe('Hussein Dey')
  })

  it('returns null for a commune that is genuinely different', () => {
    expect(bestCommuneMatch(ALGER_COMMUNES, 'Oran')).toBeNull()
    expect(bestCommuneMatch(ALGER_COMMUNES, '')).toBeNull()
    expect(bestCommuneMatch([], 'Kouba')).toBeNull()
  })

  it('prefers an exact match over a closer-prefix competitor', () => {
    expect(bestCommuneMatch(['El Harrouch', 'El Harrach'], 'El Harrach')).toBe('El Harrach')
  })
})

describe('resolveCourierDestination', () => {
  const creds = { apiId: 'id', apiToken: 'tok' }

  it('maps the order commune onto the courier canonical spelling and wilaya name', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => feesResponse('Alger', ALGER_COMMUNES)))
    const resolved = await resolveCourierDestination('https://api.test/v1', creds, 'Alger', 'Alger', 'Ain Taya')
    expect(resolved).toEqual({ toWilaya: 'Alger', toCommune: 'Aïn Taya' })
  })

  it('falls back to null when the courier returns no communes for the wilaya', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ per_commune: {} }) })))
    const resolved = await resolveCourierDestination('https://api.test/v1', creds, 'Alger', 'Sétif', 'Ain Taya')
    expect(resolved).toBeNull()
  })

  it('queries the fees endpoint with numeric wilaya codes', async () => {
    const fetchMock = vi.fn(async () => feesResponse('Alger', ALGER_COMMUNES))
    vi.stubGlobal('fetch', fetchMock)
    await resolveCourierDestination('https://api.test/v1', creds, 'Aïn Defla', 'Alger', 'Kouba')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/v1/fees/?from_wilaya_id=44&to_wilaya_id=16',
      expect.objectContaining({ headers: expect.objectContaining({ 'X-API-ID': 'id' }) }),
    )
  })

  it('falls back to null (raw names) on network or HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    await expect(resolveCourierDestination('https://api.test/v1', creds, 'Alger', 'Alger', 'Kouba')).resolves.toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
    await expect(resolveCourierDestination('https://api.test/v1', creds, 'Alger', 'Alger', 'Kouba')).resolves.toBeNull()
  })

  it('skips the API entirely when a wilaya code is unknown or commune is blank', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(resolveCourierDestination('https://api.test/v1', creds, 'Not A Wilaya', 'Alger', 'Kouba')).resolves.toBeNull()
    await expect(resolveCourierDestination('https://api.test/v1', creds, 'Alger', 'Alger', '   ')).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to null when no commune is close enough (courier likely does not cover it)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => feesResponse('Alger', ALGER_COMMUNES)))
    const resolved = await resolveCourierDestination('https://api.test/v1', creds, 'Alger', 'Alger', 'Zighoud Youcef')
    expect(resolved).toBeNull()
  })
})
