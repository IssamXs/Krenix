import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
let mockStore: { id: string; plan: string } = { id: 'store-1', plan: 'ultimate' }
const pages: Record<string, unknown>[] = [{ id: 'page-1', store_id: 'store-1', title: 'FAQ', slug: 'faq' }]
const updates: Record<string, unknown>[] = []
const deletedIds: string[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }),
}))

vi.mock('@/lib/server-store', () => ({
  resolveActiveStoreServer: async () => mockStore,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table !== 'site_pages') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({ eq: (_c: string, id: string) => ({ single: async () => ({ data: pages.find(p => p.id === id) ?? null }) }) }),
        update: (payload: Record<string, unknown>) => ({
          eq: (_c: string, id: string) => ({
            select: () => ({
              single: async () => {
                updates.push({ id, ...payload })
                return { data: { ...pages.find(p => p.id === id), ...payload }, error: null }
              },
            }),
          }),
        }),
        delete: () => ({ eq: async (_c: string, id: string) => { deletedIds.push(id); return { error: null } } }),
      }
    },
  }),
}))

import { PATCH, DELETE } from './route'

function makeRequest(method: string, body?: Record<string, unknown>) {
  return new Request('http://test/api/site-pages/page-1', { method, body: body ? JSON.stringify(body) : undefined })
}
const params = { params: Promise.resolve({ id: 'page-1' }) }

beforeEach(() => {
  updates.length = 0
  deletedIds.length = 0
  mockStore = { id: 'store-1', plan: 'ultimate' }
})

describe('PATCH /api/site-pages/[id]', () => {
  it('updates the blocks of an owned page', async () => {
    const blocks = [{ id: 'b1', type: 'text', props: {}, style: { base: {} } }]
    const res = await PATCH(makeRequest('PATCH', { blocks }), params)
    expect(res.status).toBe(200)
    expect(updates[0]).toMatchObject({ id: 'page-1', blocks })
  })

  it('refuses a page belonging to another store', async () => {
    mockStore = { id: 'store-OTHER', plan: 'ultimate' }
    const res = await PATCH(makeRequest('PATCH', { blocks: [] }), params)
    expect(res.status).toBe(403)
    expect(updates).toEqual([])
  })

  it('refuses a store below Ultimate', async () => {
    mockStore = { id: 'store-1', plan: 'pro' }
    const res = await PATCH(makeRequest('PATCH', { blocks: [] }), params)
    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/site-pages/[id]', () => {
  it('deletes an owned page', async () => {
    const res = await DELETE(makeRequest('DELETE'), params)
    expect(res.status).toBe(200)
    expect(deletedIds).toEqual(['page-1'])
  })

  it('refuses a page belonging to another store', async () => {
    mockStore = { id: 'store-OTHER', plan: 'ultimate' }
    const res = await DELETE(makeRequest('DELETE'), params)
    expect(res.status).toBe(403)
    expect(deletedIds).toEqual([])
  })
})
