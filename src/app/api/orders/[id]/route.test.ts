import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'

// Authorization regression test (mirrors orders/delete/route.test.ts): user A
// must never be able to edit user B's order by passing its id.
const mockUser = { id: 'user-A' }

const baseOrder = {
  id: 'order-A1', store_id: 'store-A', status: 'pending',
  customer_name: 'Ali', customer_phone: '0555111222', wilaya: 'Alger', commune: 'Bab Ezzouar',
  address: null, delivery_type: 'home', delivery_price: 400, quantity: 1, total_price: 2400,
  product_id: 'prod-1', color: null, size: null,
  product: { name: 'T-shirt' },
  order_items: [],
}

let storeOwnerId = 'user-A'
let ordersCallCount = 0
let rpcCalls: Array<{ name: string; params: unknown }> = []
let rpcResult: unknown
let rpcError: unknown
let insertedEdits: unknown[] = []

function fixedSingle(data: unknown) {
  const obj: { select: () => typeof obj; eq: () => typeof obj; single: () => Promise<{ data: unknown }> } = {
    select: () => obj,
    eq: () => obj,
    single: () => Promise.resolve({ data }),
  }
  return obj
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'orders') {
        ordersCallCount++
        // First call = the pre-edit fetch used for authorization + the diff's
        // "before" state. Every later call simulates the row as update_order()
        // left it, so the route's final refetch reflects the RPC's result.
        const data = ordersCallCount === 1 ? baseOrder : { ...baseOrder, ...(rpcResult as object), order_items: [] }
        return fixedSingle(data)
      }
      if (table === 'stores') return fixedSingle({ id: 'store-A', owner_id: storeOwnerId })
      if (table === 'order_edits') {
        return { insert: (row: unknown) => { insertedEdits.push(row); return Promise.resolve({ error: null }) } }
      }
      throw new Error(`unexpected table ${table}`)
    },
    rpc(name: string, params: unknown) {
      rpcCalls.push({ name, params })
      return Promise.resolve({ data: rpcResult, error: rpcError })
    },
  }),
}))

beforeEach(() => {
  storeOwnerId = 'user-A'
  ordersCallCount = 0
  rpcCalls = []
  rpcResult = { ...baseOrder, total_price: 3000, quantity: 2 }
  rpcError = null
  insertedEdits = []
})

function makeRequest(body: unknown) {
  return new Request('http://test/api/orders/order-A1', { method: 'PATCH', body: JSON.stringify(body) })
}

const VALID_BODY = {
  customer_name: 'Ali', customer_phone: '0555111222', wilaya: 'Alger', commune: 'Bab Ezzouar',
  delivery_type: 'home', delivery_price: 400,
  items: [{ product_id: 'prod-1', color: null, size: null, quantity: 2 }],
}

describe('PATCH /api/orders/[id]', () => {
  it('refuses to edit another store\'s order', async () => {
    storeOwnerId = 'user-B'
    const res = await PATCH(makeRequest(VALID_BODY), { params: Promise.resolve({ id: 'order-A1' }) })
    expect(res.status).toBe(403)
    expect(rpcCalls).toHaveLength(0)
  })

  it('rejects an empty item list before calling the database', async () => {
    const res = await PATCH(makeRequest({ ...VALID_BODY, items: [] }), { params: Promise.resolve({ id: 'order-A1' }) })
    expect(res.status).toBe(400)
    expect(rpcCalls).toHaveLength(0)
  })

  it('rejects an item with an out-of-range quantity before calling the database', async () => {
    const res = await PATCH(
      makeRequest({ ...VALID_BODY, items: [{ product_id: 'prod-1', color: null, size: null, quantity: 999 }] }),
      { params: Promise.resolve({ id: 'order-A1' }) },
    )
    expect(res.status).toBe(400)
    expect(rpcCalls).toHaveLength(0)
  })

  it('calls update_order with the sanitized items and returns the updated order', async () => {
    const res = await PATCH(makeRequest(VALID_BODY), { params: Promise.resolve({ id: 'order-A1' }) })
    expect(res.status).toBe(200)
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].params).toMatchObject({
      p_order_id: 'order-A1',
      p_store_id: 'store-A',
      p_items: [{ product_id: 'prod-1', color: null, size: null, quantity: 2 }],
    })
    const body = await res.json()
    expect(body.order.total_price).toBe(3000)
  })

  it('surfaces the RPC exception message when the update is rejected', async () => {
    rpcError = { code: 'P0001', message: 'Numéro de téléphone invalide' }
    const res = await PATCH(makeRequest(VALID_BODY), { params: Promise.resolve({ id: 'order-A1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Numéro de téléphone invalide')
  })

  it('logs an edit-history row summarizing what changed', async () => {
    await PATCH(makeRequest(VALID_BODY), { params: Promise.resolve({ id: 'order-A1' }) })
    expect(insertedEdits).toHaveLength(1)
    const changes = (insertedEdits[0] as { changes: Record<string, unknown> }).changes
    expect(changes).toHaveProperty('total_price', { from: 2400, to: 3000 })
  })
})
