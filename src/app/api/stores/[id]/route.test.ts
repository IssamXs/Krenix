import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE } from './route'

// Authorization regression test: user A must never be able to delete a store
// owned by user B by passing its id in the URL.
const mockUser = { id: 'user-A' }

const stores = [
  { id: 'store-A', owner_id: 'user-A' },
  { id: 'store-B', owner_id: 'user-B' },
]
const deletedStoreIds: string[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'stores') {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({
              single: async () => ({ data: stores.find(s => s.id === id) ?? null }),
            }),
          }),
          delete: () => ({
            eq: async (_c: string, id: string) => { deletedStoreIds.push(id); return { error: null } },
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

beforeEach(() => { deletedStoreIds.length = 0 })

describe('DELETE /api/stores/[id] authorization', () => {
  it('refuses to delete a store owned by another user', async () => {
    const req = new Request('http://test/api/stores/store-B', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'store-B' }) })
    expect(res.status).toBe(403)
    expect(deletedStoreIds).toEqual([])
  })

  it('allows deleting your own store', async () => {
    const req = new Request('http://test/api/stores/store-A', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'store-A' }) })
    expect(res.status).toBe(200)
    expect(deletedStoreIds).toEqual(['store-A'])
  })
})
