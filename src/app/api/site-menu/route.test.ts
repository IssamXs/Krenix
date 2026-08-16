import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
let mockStore: { id: string; plan: string; settings: Record<string, unknown> } = { id: 'store-1', plan: 'ultimate', settings: {} }
const updates: Record<string, unknown>[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }),
}))

vi.mock('@/lib/server-store', () => ({
  resolveActiveStoreServer: async () => mockStore,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table !== 'stores') throw new Error(`unexpected table ${table}`)
      return {
        update: (payload: Record<string, unknown>) => ({
          eq: async (_c: string, id: string) => { updates.push({ id, ...payload }); return { error: null } },
        }),
      }
    },
  }),
}))

import { PATCH } from './route'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://test/api/site-menu', { method: 'PATCH', body: JSON.stringify(body) })
}

beforeEach(() => {
  updates.length = 0
  mockStore = { id: 'store-1', plan: 'ultimate', settings: {} }
})

describe('PATCH /api/site-menu', () => {
  it('writes the menu array into settings.siteMenu, preserving other settings', async () => {
    mockStore = { id: 'store-1', plan: 'ultimate', settings: { whatsapp: '0555000000' } }
    const menu = [{ id: '1', label: 'Accueil', type: 'builtin', target: 'home', order: 0 }]
    const res = await PATCH(makeRequest({ menu }))
    expect(res.status).toBe(200)
    expect(updates[0]).toMatchObject({
      id: 'store-1',
      settings: { whatsapp: '0555000000', siteMenu: menu },
    })
  })

  it('refuses a store below Ultimate', async () => {
    mockStore = { id: 'store-1', plan: 'pro', settings: {} }
    const res = await PATCH(makeRequest({ menu: [] }))
    expect(res.status).toBe(403)
    expect(updates).toEqual([])
  })

  it('refuses a non-array menu payload', async () => {
    const res = await PATCH(makeRequest({ menu: 'nope' }))
    expect(res.status).toBe(400)
  })
})
