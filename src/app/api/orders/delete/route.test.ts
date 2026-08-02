import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

// Authorization regression test: user A must never be able to delete user B's
// order by passing its id, even in a mixed batch with their own order ids.
const mockUser = { id: 'user-A' }

const orders = [
  { id: 'order-A1', store_id: 'store-A' },
  { id: 'order-B1', store_id: 'store-B' },
]
const stores = [
  { id: 'store-A', owner_id: 'user-A' },
  { id: 'store-B', owner_id: 'user-B' },
]
let deletedIds: string[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'orders') {
        return {
          select: () => ({
            in: (_col: string, ids: string[]) =>
              Promise.resolve({ data: orders.filter(o => ids.includes(o.id)) }),
          }),
          delete: () => ({
            in: (_col: string, ids: string[]) => {
              deletedIds.push(...ids)
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      if (table === 'stores') {
        return {
          select: () => ({
            in: (_col: string, ids: string[]) => ({
              eq: (_col2: string, ownerId: string) =>
                Promise.resolve({ data: stores.filter(s => ids.includes(s.id) && s.owner_id === ownerId) }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

beforeEach(() => { deletedIds = [] })

describe('POST /api/orders/delete authorization', () => {
  it('refuses to delete another store\'s order by id', async () => {
    const req = new Request('http://test/api/orders/delete', {
      method: 'POST',
      body: JSON.stringify({ ids: ['order-B1'] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    expect(deletedIds).toEqual([])
  })

  it('deletes only the caller\'s own order out of a mixed batch', async () => {
    const req = new Request('http://test/api/orders/delete', {
      method: 'POST',
      body: JSON.stringify({ ids: ['order-A1', 'order-B1'] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(deletedIds).toEqual(['order-A1'])
  })
})
