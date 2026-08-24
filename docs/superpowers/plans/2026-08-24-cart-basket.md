# Panier (Cart) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a storefront customer add multiple products to a cart while browsing a store, then confirm one combined order — while leaving the existing single-product "Commander" flow completely untouched for the common case of a single item.

**Architecture:** A new `order_items` table records the per-product breakdown of a cart checkout; the existing `orders` row stays the parent record (unchanged shape/behavior for every existing single-product order). Cart state lives in a small React Context backed by a client-side cookie (never `localStorage`/`sessionStorage`, per CLAUDE.md) so it survives navigation across the store's pages. All cart pricing is recomputed server-side in a new Postgres function (`create_cart_order`), reusing the existing `compute_offer_total()` — the client is never trusted for a cart total, matching how `validate_order_insert` already treats single-product orders. The cart UI is a single floating widget mounted once at each store layout, and "Ajouter au panier" is added to `OrderFormFields.tsx` — the one component every product-purchase surface in this codebase already renders, so no theme-by-theme integration is needed.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + RLS + plpgsql functions), React Context, vitest.

Reference spec: [`docs/superpowers/specs/2026-08-24-cart-and-categories-design.md`](../specs/2026-08-24-cart-and-categories-design.md) — Part A.

---

### Task 1: Database migration — `order_items` table + `create_cart_order` RPC

**Files:**
- Create: `database/064_order_items.sql`

`create_cart_order` is the single place that prices a cart order — it re-derives every line's price from `products` (never trusts the client), applies the product's active offer via the existing `compute_offer_total()` (migration 058), and inserts both the parent `orders` row and its `order_items` rows in one function call, which runs as one Postgres transaction (all-or-nothing — no risk of an order existing with missing line items).

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- 062 — Cart orders: order_items table + create_cart_order() RPC.
-- Idempotent — safe to run multiple times. Paste into Supabase → SQL Editor.
--
-- WHY a stored function instead of two client-side inserts: order_items rows
-- can only be inserted after the parent order exists (FK), so a BEFORE INSERT
-- trigger on `orders` (like validate_order_insert) can never see the cart
-- contents to price it. Pricing + both inserts happen here instead, in one
-- transaction, reusing compute_offer_total() from 058_product_offers.sql so
-- offers are honored identically to single-product orders.
-- ============================================================

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  -- Snapshot of the product name at order time — order history must stay
  -- readable even if the product is later renamed or deleted.
  product_name TEXT NOT NULL,
  color TEXT,
  size TEXT,
  quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 100),
  unit_price NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store owners can read own order items"
  ON order_items FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM orders WHERE store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    )
    OR is_super_admin()
  );

-- No public/anon policy: order_items, like orders, must never be readable by
-- the storefront's anon key (see the comment at the top of
-- src/app/api/orders/route.ts explaining why order creation is server-side).
-- No client-side write policy either — every write goes through
-- create_cart_order() below, called with the service role.

CREATE OR REPLACE FUNCTION create_cart_order(
  p_store_id UUID,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_wilaya TEXT,
  p_commune TEXT,
  p_delivery_type TEXT,
  p_delivery_price NUMERIC,
  p_notes TEXT,
  p_source TEXT,
  p_fraud_risk_score NUMERIC,
  p_fraud_signals JSONB,
  p_items JSONB -- [{product_id, color, size, quantity}]
) RETURNS orders AS $$
DECLARE
  v_order orders;
  v_item JSONB;
  v_product RECORD;
  v_subtotal NUMERIC;
  v_total NUMERIC := 0;
  v_qty_sum INTEGER := 0;
  v_clamped_delivery NUMERIC;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Panier vide';
  END IF;

  v_clamped_delivery := LEAST(GREATEST(COALESCE(p_delivery_price, 0), 0), 5000);

  -- Pass 1: validate every product belongs to this store and sum the total
  -- BEFORE inserting anything.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_item->>'quantity') IS NULL OR (v_item->>'quantity')::INTEGER < 1 OR (v_item->>'quantity')::INTEGER > 100 THEN
      RAISE EXCEPTION 'Quantité invalide';
    END IF;
    SELECT id, price, offer_type, offer_config, offer_active INTO v_product
      FROM products WHERE id = (v_item->>'product_id')::UUID AND store_id = p_store_id;
    IF v_product IS NULL THEN
      RAISE EXCEPTION 'Produit invalide dans le panier';
    END IF;
    IF v_product.offer_active THEN
      v_subtotal := compute_offer_total(v_product.price, (v_item->>'quantity')::INTEGER, v_product.offer_type, v_product.offer_config);
    ELSE
      v_subtotal := v_product.price * (v_item->>'quantity')::INTEGER;
    END IF;
    v_total := v_total + v_subtotal;
    v_qty_sum := v_qty_sum + (v_item->>'quantity')::INTEGER;
  END LOOP;

  -- unit_price is a sentinel 0 here — orders.unit_price is NOT NULL DEFAULT 0
  -- at the schema level and is meaningless for a multi-product order; the
  -- real per-line prices live in order_items.unit_price/subtotal below.
  INSERT INTO orders (
    store_id, product_id, landing_page_id, customer_name, customer_phone, wilaya, commune,
    quantity, unit_price, total_price, delivery_price, delivery_type, status, source, notes,
    fraud_risk_score, fraud_signals
  ) VALUES (
    p_store_id, NULL, NULL, p_customer_name, p_customer_phone, p_wilaya, p_commune,
    v_qty_sum, 0, v_total + v_clamped_delivery, v_clamped_delivery,
    CASE WHEN p_delivery_type = 'desk' THEN 'desk' ELSE 'home' END,
    'pending', p_source, p_notes, p_fraud_risk_score, p_fraud_signals
  ) RETURNING * INTO v_order;

  -- Pass 2: insert the line items now that the parent order exists.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT id, name, price, offer_type, offer_config, offer_active INTO v_product
      FROM products WHERE id = (v_item->>'product_id')::UUID;
    IF v_product.offer_active THEN
      v_subtotal := compute_offer_total(v_product.price, (v_item->>'quantity')::INTEGER, v_product.offer_type, v_product.offer_config);
    ELSE
      v_subtotal := v_product.price * (v_item->>'quantity')::INTEGER;
    END IF;
    INSERT INTO order_items (order_id, product_id, product_name, color, size, quantity, unit_price, subtotal)
    VALUES (
      v_order.id, v_product.id, v_product.name,
      NULLIF(v_item->>'color', ''), NULLIF(v_item->>'size', ''),
      (v_item->>'quantity')::INTEGER, v_product.price, v_subtotal
    );
  END LOOP;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Run it**

Paste into Supabase → SQL Editor → Run. Confirm `order_items` exists with RLS enabled and `create_cart_order` appears under Database → Functions.

- [ ] **Step 3: Smoke-test the function directly in the SQL editor**

Run (substituting a real `store_id` and two real `product_id`s from that store):

```sql
SELECT * FROM create_cart_order(
  '<store_id>'::UUID, 'Test Client', '0555123456', 'Alger', 'Alger Centre',
  'home', 400, NULL, 'form', NULL, NULL,
  jsonb_build_array(
    jsonb_build_object('product_id', '<product_id_1>', 'color', NULL, 'size', NULL, 'quantity', 2),
    jsonb_build_object('product_id', '<product_id_2>', 'color', NULL, 'size', NULL, 'quantity', 1)
  )
);
```

Expected: one row returned with `product_id IS NULL`, `quantity = 3`, `total_price` = sum of both products' prices (×2 and ×1) + 400. Then run `SELECT * FROM order_items WHERE order_id = '<returned id>'` and confirm two rows with correct `product_name`/`unit_price`/`subtotal`. Delete the test order afterward (`DELETE FROM orders WHERE id = '<returned id>'` — `order_items` cascades).

- [ ] **Step 4: Commit**

```bash
git add database/064_order_items.sql
git commit -m "feat(db): add order_items table and create_cart_order() RPC"
```

---

### Task 2: TypeScript types

**Files:**
- Modify: `src/types/database.ts` (Order interface region)

- [ ] **Step 1: Add the `OrderItem` interface and extend `Order`**

Add, right before the `Order` interface:

```typescript
// ============================================================
// ORDER ITEM
// ============================================================
// A cart checkout's per-product breakdown. A single-product order (still the
// vast majority — see OrderFormFields.tsx) has NO order_items rows at all;
// its product/price stay directly on the `orders` row exactly as before.
// See Database/064_order_items.sql.
export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  product_name: string
  color: string | null
  size: string | null
  quantity: number
  unit_price: number
  subtotal: number
  created_at: string
}
```

Then add one joined field to `Order` (alongside the existing `product?: Product` / `landing_page?: LandingPage` joined fields at the bottom of the interface):

```typescript
  // Joined fields
  product?: Product
  landing_page?: LandingPage
  // Present (non-empty) only for cart checkouts. See OrderItem above.
  order_items?: OrderItem[]
```

- [ ] **Step 2: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(types): add OrderItem type and Order.order_items"
```

---

### Task 3: `/api/orders` — accept a cart `items[]` payload

**Files:**
- Modify: `src/app/api/orders/route.ts`
- Modify: `src/app/api/orders/route.test.ts`

The single-product path (no `items` in the body) must stay byte-for-byte behaviorally identical — every existing call site (`OrderFormFields.tsx`) keeps working unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/api/orders/route.test.ts` (after the existing `describe` blocks, using the same `admin` mock already defined at the top of the file — extend its `orders` table handler to also support `.rpc`, and add an `order_items` handler):

First, extend the existing mock at the top of the file. Change the `vi.mock('@/lib/supabase/admin', ...)` block (lines 25-70) by adding an `rpc` method to the returned client object and an `order_items` table branch — replace the whole mock block with:

```typescript
let rpcOrder: Record<string, unknown> | null = null
let rpcError: { code?: string; message: string } | null = null
let rpcCalls: Record<string, unknown>[] = []
const insertedItems: Record<string, unknown>[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      return Promise.resolve({ data: rpcOrder, error: rpcError })
    },
    from(table: string) {
      const builder = (resolveLimit: () => unknown) => {
        const b: Record<string, unknown> = {
          select: () => b,
          eq: () => b,
          order: () => b,
          gte: () => b,
          limit: async () => resolveLimit(),
          maybeSingle: async () => ({ data: storeRow }),
        }
        return b
      }
      if (table === 'stores') {
        return builder(() => ({ data: [] }))
      }
      if (table === 'orders') {
        return {
          insert: (payload: Record<string, unknown>) => {
            insertedOrders.push(payload)
            return {
              select: () => ({
                single: async () => ({
                  data: { id: 'order-1', order_number: 'K-1', total_price: 1000, wilaya: 'Alger', commune: 'Alger', color: null, quantity: 1, customer_name: 'Amira' },
                  error: null,
                }),
              }),
            }
          },
          select: () => builder(() => ({ data: previousOrders })),
        }
      }
      if (table === 'order_items') {
        return { insert: (payload: Record<string, unknown>) => { insertedItems.push(payload); return Promise.resolve({ error: null }) } }
      }
      if (table === 'fraud_order_signals') {
        return {
          insert: (payload: Record<string, unknown>) => { insertedSignals.push(payload); return Promise.resolve({ error: null }) },
          select: (cols: string) =>
            cols === 'id'
              ? builder(() => ({ data: fingerprintMatches }))
              : builder(() => ({ data: signalHistory })),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))
```

Then update the `beforeEach` block to also reset the new state:

```typescript
beforeEach(() => {
  insertedOrders.length = 0
  insertedSignals.length = 0
  insertedItems.length = 0
  rpcCalls = []
  rpcOrder = { id: 'order-cart-1', order_number: 'K-2', total_price: 1400, wilaya: 'Alger', commune: 'Alger Centre', color: null, quantity: 3, customer_name: 'Amira', customer_phone: '0555123456' }
  rpcError = null
  previousOrders = []
  signalHistory = []
  fingerprintMatches = []
  storeRow = { id: 'store-1', is_suspended: false, subscription_status: 'active', fraud_shield_enabled: false }
})
```

Now add the new test block at the end of the file:

```typescript
describe('POST /api/orders — cart items[]', () => {
  const CART_BODY = {
    store_id: 'store-1',
    customer_name: 'Amira Benali',
    customer_phone: '0555123456',
    wilaya: 'Alger',
    commune: 'Alger Centre',
    items: [
      { product_id: 'prod-1', color: 'Bleu', size: null, quantity: 2 },
      { product_id: 'prod-2', color: null, size: 'M', quantity: 1 },
    ],
  }

  it('calls create_cart_order with the submitted items and never the single-product insert path', async () => {
    const res = await POST(makeRequest(CART_BODY))
    expect(res.status).toBe(200)
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].fn).toBe('create_cart_order')
    const args = rpcCalls[0].args as { p_items: unknown[]; p_store_id: string }
    expect(args.p_store_id).toBe('store-1')
    expect(args.p_items).toEqual(CART_BODY.items)
    expect(insertedOrders).toHaveLength(0) // the legacy single-insert path must not run
  })

  it('rejects a cart item with an invalid quantity before calling the database', async () => {
    const res = await POST(makeRequest({ ...CART_BODY, items: [{ product_id: 'prod-1', quantity: 0 }] }))
    expect(res.status).toBe(400)
    expect(rpcCalls).toHaveLength(0)
  })

  it('rejects a cart item missing a product_id before calling the database', async () => {
    const res = await POST(makeRequest({ ...CART_BODY, items: [{ product_id: '', quantity: 1 }] }))
    expect(res.status).toBe(400)
    expect(rpcCalls).toHaveLength(0)
  })

  it('surfaces the RPC exception message when the database rejects the cart', async () => {
    rpcOrder = null
    rpcError = { code: 'P0001', message: 'Produit invalide dans le panier' }
    const res = await POST(makeRequest(CART_BODY))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe('Produit invalide dans le panier')
  })

  it('still uses the legacy single-insert path when no items[] is present', async () => {
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    expect(rpcCalls).toHaveLength(0)
    expect(insertedOrders).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/app/api/orders/route.test.ts`
Expected: the 5 new tests FAIL (route doesn't branch on `items` yet — `rpcCalls` stays empty for the cart tests, or the mock's `rpc` doesn't exist yet).

- [ ] **Step 3: Implement the branch in the route**

In `src/app/api/orders/route.ts`, make three changes.

First, add `items` to the destructured body (line 81-88 — add `items` to the list):

```typescript
    const {
      store_id, product_id, landing_page_id, variant,
      customer_name, customer_phone, wilaya, commune,
      color, size, quantity, unit_price, delivery_price, total_price,
      source, notes, delivery_type, items,
      turnstile_token, device_fingerprint, time_on_page_ms, had_movement, form_fill_ms,
      input_events, paste_events, avg_key_delay_ms, max_input_gap_ms, tab_hidden_ms, scroll_events, focus_events,
    } = body
```

Second, make the quantity validation (lines 99-102) conditional — a cart request validates quantity per-item inside the RPC instead:

```typescript
    const hasItems = Array.isArray(items) && items.length > 0
    let qty = 0
    if (!hasItems) {
      qty = Number(quantity)
      if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
        return NextResponse.json({ error: 'Quantité invalide.' }, { status: 400 })
      }
    }
```

Third, replace the order-insert block (originally lines 235-277, from `const insertPayload` through the `if (error) { ... }` check) with:

```typescript
    let order: { id: string; order_number: string; total_price: number; wilaya: string; commune: string; color: string | null; quantity: number; customer_name: string; customer_phone: string } | null = null
    let orderError: { code?: string; message: string } | null = null

    if (hasItems) {
      const cleanItems = (items as Array<Record<string, unknown>>).map(it => ({
        product_id: String(it.product_id ?? ''),
        color: it.color ? String(it.color) : null,
        size: it.size ? String(it.size) : null,
        quantity: Number(it.quantity) || 0,
      }))
      if (cleanItems.some(it => !it.product_id || it.quantity < 1 || it.quantity > 100)) {
        return NextResponse.json({ error: 'Panier invalide.' }, { status: 400 })
      }
      const { data, error } = await admin.rpc('create_cart_order', {
        p_store_id: store_id,
        p_customer_name: String(customer_name).trim().slice(0, 100),
        p_customer_phone: String(customer_phone).replace(/\s/g, ''),
        p_wilaya: wilaya,
        p_commune: String(commune).trim().slice(0, 100),
        p_delivery_type: delivery_type === 'desk' ? 'desk' : 'home',
        p_delivery_price: Number(delivery_price) || 0,
        p_notes: notes || null,
        p_source: source || 'form',
        p_fraud_risk_score: store.fraud_shield_enabled ? fraudRiskScore : null,
        p_fraud_signals: store.fraud_shield_enabled ? fraudSignals : null,
        p_items: cleanItems,
      })
      order = data
      orderError = error
    } else {
      const insertPayload: Record<string, unknown> = {
        store_id,
        product_id: product_id ?? null,
        landing_page_id: landing_page_id ?? null,
        variant: variant ?? null,
        customer_name: String(customer_name).trim().slice(0, 100),
        customer_phone: String(customer_phone).replace(/\s/g, ''),
        wilaya,
        commune: String(commune).trim().slice(0, 100),
        color: color || null,
        size: size || null,
        quantity: qty,
        unit_price: Number(unit_price) || 0,
        delivery_price: Number(delivery_price) || 0,
        total_price: Number(total_price) || 0,
        delivery_type: delivery_type === 'desk' ? 'desk' : 'home',
        status: 'pending',
        source: source || 'form',
        notes: notes || null,
      }
      if (store.fraud_shield_enabled) {
        insertPayload.fraud_risk_score = fraudRiskScore
        insertPayload.fraud_signals = fraudSignals
      }
      const { data, error } = await admin
        .from('orders')
        .insert(insertPayload)
        .select('id, order_number, total_price, wilaya, commune, color, quantity, customer_name, customer_phone')
        .single()
      order = data
      orderError = error
    }

    if (orderError) {
      // Same convention as before: DB triggers/functions raise P0001 with a
      // ready-to-show French message; surface that, hide anything else.
      console.error('[api/orders] insert failed:', orderError)
      const isTriggerMessage = orderError.code === 'P0001'
      return NextResponse.json(
        { error: isTriggerMessage ? orderError.message : 'Erreur lors de la commande. Réessayez.' },
        { status: isTriggerMessage ? 400 : 500 },
      )
    }
```

Everything after this point (the `fraud_order_signals` insert, the Telegram notification, the final `return NextResponse.json({ order })`) already only reads `order`/`order?.id`/etc. and needs no changes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/orders/route.test.ts`
Expected: PASS — all previously-existing tests still pass (legacy path untouched) plus the 5 new cart tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/orders/route.ts src/app/api/orders/route.test.ts
git commit -m "feat(api): accept cart items[] on /api/orders via create_cart_order RPC"
```

---

### Task 4: `src/lib/store-cart.ts` — pure cart cookie logic

**Files:**
- Create: `src/lib/store-cart.ts`
- Test: `src/lib/store-cart.test.ts`

Kept as pure functions (operating on a cookie *string*, not `document` directly) so they're unit-testable under this project's `node`-environment vitest config (`vitest.config.ts` — no jsdom, tests are `.test.ts` only). The React-facing `CartProvider` (Task 5) is the only place that touches `document.cookie`, and it's a thin wrapper around these functions.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/store-cart.test.ts
import { describe, it, expect } from 'vitest'
import {
  cartCookieName, parseCartCookie, serializeCartCookie,
  addCartItem, removeCartItem, updateCartItemQuantity, cartTotals,
  type CartItem,
} from './store-cart'

const item = (over: Partial<CartItem> = {}): CartItem => ({
  productId: 'prod-1', name: 'Couvre matelas', image: null, unitPrice: 2500,
  color: null, size: null, quantity: 1, pageUrl: '/p/couvre-matelas', ...over,
})

describe('cartCookieName', () => {
  it('namespaces the cookie by store slug', () => {
    expect(cartCookieName('le-mirage')).toBe('krenix_cart_le-mirage')
  })
})

describe('parseCartCookie', () => {
  it('returns an empty array when the cookie is absent', () => {
    expect(parseCartCookie('other_cookie=1', 'le-mirage')).toEqual([])
  })

  it('parses a previously-serialized cart', () => {
    const items = [item()]
    const cookieString = serializeCartCookie('le-mirage', items).split(';')[0]
    expect(parseCartCookie(cookieString, 'le-mirage')).toEqual(items)
  })

  it('ignores malformed cookie content instead of throwing', () => {
    expect(parseCartCookie('krenix_cart_le-mirage=not-json', 'le-mirage')).toEqual([])
  })
})

describe('addCartItem', () => {
  it('adds a new line for a product/variant combination not already in the cart', () => {
    const result = addCartItem([], item())
    expect(result).toHaveLength(1)
  })

  it('merges quantities when the same product+color+size is added again', () => {
    const result = addCartItem([item({ quantity: 2 })], item({ quantity: 3 }))
    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(5)
  })

  it('keeps separate lines for the same product in different colors', () => {
    const result = addCartItem([item({ color: 'Bleu' })], item({ color: 'Rouge' }))
    expect(result).toHaveLength(2)
  })
})

describe('removeCartItem', () => {
  it('removes only the matching product+variant line', () => {
    const items = [item({ color: 'Bleu' }), item({ color: 'Rouge' })]
    const result = removeCartItem(items, { productId: 'prod-1', color: 'Bleu', size: null })
    expect(result).toEqual([item({ color: 'Rouge' })])
  })
})

describe('updateCartItemQuantity', () => {
  it('updates the quantity of the matching line', () => {
    const result = updateCartItemQuantity([item()], { productId: 'prod-1', color: null, size: null }, 4)
    expect(result[0].quantity).toBe(4)
  })

  it('removes the line when the quantity drops below 1', () => {
    const result = updateCartItemQuantity([item()], { productId: 'prod-1', color: null, size: null }, 0)
    expect(result).toEqual([])
  })
})

describe('cartTotals', () => {
  it('sums item count and price across every line', () => {
    const totals = cartTotals([item({ quantity: 2, unitPrice: 1000 }), item({ productId: 'prod-2', quantity: 1, unitPrice: 500 })])
    expect(totals).toEqual({ totalItems: 3, totalPrice: 2500 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/store-cart.test.ts`
Expected: FAIL — `./store-cart` module doesn't exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/store-cart.ts
//
// Pure cart cookie logic — no DOM access here (see store-cart.test.ts,
// which runs under vitest's node environment). CartProvider.tsx is the only
// place that touches `document.cookie`, wrapping these functions.
//
// Cookie-based, not localStorage/sessionStorage — CLAUDE.md forbids both for
// components on this project. Mirrors the existing cookie-mirroring pattern
// in src/lib/active-store.ts (setActiveStoreId).

export interface CartItem {
  productId: string
  name: string
  image: string | null
  unitPrice: number
  color: string | null
  size: string | null
  quantity: number
  // Path of the page the item was added from (e.g. "/p/couvre-matelas").
  // Used to send a single-item cart straight back to that product's own
  // existing order flow instead of building a second checkout UI for it.
  pageUrl: string
}

type CartLine = { productId: string; color: string | null; size: string | null }

export function cartCookieName(storeSlug: string): string {
  return `krenix_cart_${storeSlug}`
}

function isValidCartItem(x: unknown): x is CartItem {
  if (!x || typeof x !== 'object') return false
  const i = x as Record<string, unknown>
  return typeof i.productId === 'string' && typeof i.name === 'string' && typeof i.unitPrice === 'number' && typeof i.quantity === 'number' && typeof i.pageUrl === 'string'
}

export function parseCartCookie(cookieString: string, storeSlug: string): CartItem[] {
  const name = cartCookieName(storeSlug)
  const match = cookieString.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  if (!match) return []
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1]))
    return Array.isArray(parsed) ? parsed.filter(isValidCartItem) : []
  } catch {
    return []
  }
}

// 7-day expiry — long enough to survive a real browsing session, short
// enough that an abandoned cart doesn't linger forever referencing stale
// prices (the server always re-prices from the live product row anyway, but
// a fresh cart is still a better experience than a week-old one).
export function serializeCartCookie(storeSlug: string, items: CartItem[]): string {
  return `${cartCookieName(storeSlug)}=${encodeURIComponent(JSON.stringify(items))}; path=/; max-age=604800; SameSite=Lax`
}

function sameCartLine(a: CartLine, b: CartLine): boolean {
  return a.productId === b.productId && a.color === b.color && a.size === b.size
}

export function addCartItem(items: CartItem[], item: CartItem): CartItem[] {
  const existing = items.find(i => sameCartLine(i, item))
  if (!existing) return [...items, item]
  return items.map(i => (sameCartLine(i, item) ? { ...i, quantity: i.quantity + item.quantity } : i))
}

export function removeCartItem(items: CartItem[], line: CartLine): CartItem[] {
  return items.filter(i => !sameCartLine(i, line))
}

export function updateCartItemQuantity(items: CartItem[], line: CartLine, quantity: number): CartItem[] {
  if (quantity < 1) return removeCartItem(items, line)
  return items.map(i => (sameCartLine(i, line) ? { ...i, quantity } : i))
}

export function cartTotals(items: CartItem[]): { totalItems: number; totalPrice: number } {
  return {
    totalItems: items.reduce((sum, i) => sum + i.quantity, 0),
    totalPrice: items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/store-cart.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/store-cart.ts src/lib/store-cart.test.ts
git commit -m "feat(store): add pure cart cookie logic (store-cart lib)"
```

---

### Task 5: `CartProvider` — React context wrapping the pure lib

**Files:**
- Create: `src/components/store/cart/CartProvider.tsx`

- [ ] **Step 1: Write the provider**

```typescript
// src/components/store/cart/CartProvider.tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import {
  type CartItem, parseCartCookie, serializeCartCookie,
  addCartItem, removeCartItem, updateCartItemQuantity, cartTotals,
} from '@/lib/store-cart'

type CartLine = { productId: string; color: string | null; size: string | null }

interface CartContextValue {
  items: CartItem[]
  totalItems: number
  totalPrice: number
  addItem: (item: CartItem) => void
  removeItem: (line: CartLine) => void
  updateQuantity: (line: CartLine, quantity: number) => void
  clear: () => void
}

const EMPTY_CONTEXT: CartContextValue = {
  items: [], totalItems: 0, totalPrice: 0,
  addItem: () => {}, removeItem: () => {}, updateQuantity: () => {}, clear: () => {},
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ storeSlug, children }: { storeSlug: string; children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  // Cookie is the source of truth; hydrate on mount (and if the store
  // changes, e.g. dev's ?store= simulation switching stores mid-session).
  useEffect(() => {
    setItems(parseCartCookie(document.cookie, storeSlug))
  }, [storeSlug])

  const persist = (next: CartItem[]) => {
    setItems(next)
    document.cookie = serializeCartCookie(storeSlug, next)
  }

  const value: CartContextValue = {
    items,
    ...cartTotals(items),
    addItem: item => persist(addCartItem(items, item)),
    removeItem: line => persist(removeCartItem(items, line)),
    updateQuantity: (line, quantity) => persist(updateCartItemQuantity(items, line, quantity)),
    clear: () => persist([]),
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  // Defensive fallback (never throws) — keeps OrderFormFields safe if ever
  // rendered outside a CartProvider.
  return useContext(CartContext) ?? EMPTY_CONTEXT
}
```

- [ ] **Step 2: Commit**

Deferred to Task 6's commit — `CartProvider` has no mount point yet.

---

### Task 6: `CartWidget` — floating cart button + drawer, mounted in both store layouts

**Files:**
- Create: `src/components/store/cart/CartWidget.tsx`
- Modify: `src/app/(store)/layout.tsx`
- Modify: `src/app/store/layout.tsx`

Both layouts already wrap `{children}` and render one floating widget (`ChatbotWidget`) the same way — `CartProvider`/`CartWidget` follow the identical pattern, so every store-facing page (landing pages, store home, standalone product view) gets the cart with exactly two file edits instead of touching each theme.

- [ ] **Step 1: Write `CartWidget`**

```typescript
// src/components/store/cart/CartWidget.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingCart, X, Minus, Plus, Trash2 } from 'lucide-react'
import type { Store } from '@/types/database'
import { getStoreLocale } from '@/lib/i18n/store'
import { useCart } from './CartProvider'
import CartCheckoutForm from './CartCheckoutForm'

export default function CartWidget({ store }: { store: Store }) {
  const { items, totalItems, totalPrice, removeItem, updateQuantity } = useCart()
  const [open, setOpen] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const router = useRouter()
  const isRTL = getStoreLocale(store) === 'ar'

  const theme = store.theme?.config
  const primary = theme?.colors.primary ?? '#3B82F6'
  const cardBg = theme?.colors.card ?? '#111118'
  const text = theme?.colors.text ?? '#FFFFFF'
  const textMuted = theme?.colors.textMuted ?? '#9CA3AF'
  const border = theme?.colors.border ?? 'rgba(255,255,255,0.1)'

  const close = () => { setOpen(false); setCheckingOut(false) }

  // Nothing to show once the cart is empty.
  if (totalItems === 0) return null

  const handleOpen = () => {
    // A single-item cart reuses the product's own existing order flow
    // (OrderFormFields on that page) instead of a second checkout UI for the
    // simple case — see the pageUrl field on CartItem.
    if (items.length === 1) {
      router.push(items[0].pageUrl)
      return
    }
    setOpen(true)
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="fixed bottom-5 z-50 flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all hover:opacity-90"
        style={{ [isRTL ? 'left' : 'right']: '20px', background: primary, color: cardBg } as React.CSSProperties}
      >
        <ShoppingCart size={22} />
        <span
          className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold"
          style={{ background: cardBg, color: primary, border: `1.5px solid ${primary}` }}
        >
          {totalItems}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={close}
        >
          <div
            className="w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[85vh] overflow-y-auto"
            style={{ background: cardBg, border: `1px solid ${border}` }}
            onClick={e => e.stopPropagation()}
            dir={isRTL ? 'rtl' : 'ltr'}
          >
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: border }}>
              <h2 className="text-base font-bold" style={{ color: text }}>
                {checkingOut ? (isRTL ? 'إتمام الطلب' : 'Confirmer la commande') : (isRTL ? 'سلتي' : 'Mon panier')}
              </h2>
              <button onClick={close} style={{ color: textMuted }}>
                <X size={20} />
              </button>
            </div>

            {!checkingOut ? (
              <div className="p-5 space-y-4">
                {items.map(item => (
                  <div key={`${item.productId}-${item.color}-${item.size}`} className="flex gap-3">
                    <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      {item.image && <img src={item.image} alt={item.name} className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: text }}>{item.name}</p>
                      <p className="text-xs" style={{ color: textMuted }}>
                        {[item.color, item.size].filter(Boolean).join(' / ') || (isRTL ? 'قياس عادي' : 'Standard')}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <button
                          onClick={() => updateQuantity(item, item.quantity - 1)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg"
                          style={{ border: `1px solid ${border}`, color: text }}
                        >
                          <Minus size={12} />
                        </button>
                        <span className="text-xs font-semibold w-4 text-center" style={{ color: text }}>{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item, item.quantity + 1)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg"
                          style={{ border: `1px solid ${border}`, color: text }}
                        >
                          <Plus size={12} />
                        </button>
                        <button onClick={() => removeItem(item)} className="ms-auto" style={{ color: textMuted }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm font-bold flex-shrink-0" style={{ color: primary }}>
                      {(item.unitPrice * item.quantity).toLocaleString('fr-DZ')} DA
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <CartCheckoutForm store={store} isRTL={isRTL} onSuccess={close} />
            )}

            {!checkingOut && (
              <div className="p-5 border-t space-y-3" style={{ borderColor: border }}>
                <div className="flex justify-between text-sm">
                  <span style={{ color: textMuted }}>{isRTL ? 'المجموع' : 'Sous-total'}</span>
                  <span className="font-bold" style={{ color: text }}>{totalPrice.toLocaleString('fr-DZ')} DA</span>
                </div>
                <button
                  onClick={() => setCheckingOut(true)}
                  className="w-full py-3.5 rounded-2xl font-black text-sm"
                  style={{ background: primary, color: cardBg }}
                >
                  {isRTL ? 'تأكيد الطلب' : 'Confirmer ma commande'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Wire `CartProvider` + `CartWidget` into `src/app/(store)/layout.tsx`**

Add the imports (alongside the existing component imports):

```typescript
import { CartProvider } from '@/components/store/cart/CartProvider'
import CartWidget from '@/components/store/cart/CartWidget'
```

Replace the `return` inside the `if (storeSlug)` block:

```tsx
    return (
      <CartProvider storeSlug={store?.slug ?? storeSlug}>
        <StoreHtmlDir locale={locale} />
        {gtmId && <GtmScripts gtmId={gtmId} />}
        {children}
        {store && <CartWidget store={store as Store} />}
        {isChatbotEnabled && store && (
          <ChatbotWidget store={store as Store} />
        )}
      </CartProvider>
    )
```

- [ ] **Step 3: Wire `CartProvider` + `CartWidget` into `src/app/store/layout.tsx`**

Add the same two imports, then replace this file's `return` inside its `if (storeSlug)` block:

```tsx
    return (
      <CartProvider storeSlug={store?.slug ?? storeSlug}>
        {gtmId && <GtmScripts gtmId={gtmId} />}
        {(metaPixelId || tiktokPixelId) && <PixelScripts metaPixelId={metaPixelId} tiktokPixelId={tiktokPixelId} />}
        {children}
        {store && <CartWidget store={store as Store} />}
        {isChatbotEnabled && store && (
          <ChatbotWidget store={store as Store} />
        )}
      </CartProvider>
    )
```

- [ ] **Step 4: Commit**

(`CartCheckoutForm`, imported by `CartWidget`, is created in Task 7 — commit Tasks 5-7 together so the tree always compiles.)

---

### Task 7: `CartCheckoutForm` — multi-item checkout

**Files:**
- Create: `src/components/store/cart/CartCheckoutForm.tsx`

Mirrors `OrderFormFields.tsx`'s customer-info collection, delivery-fee lookup (lines ~121-150, 200-222), and fraud-shield signal collection (lines ~9-10, 106-119) — **deliberately duplicated rather than extracted into a shared hook**. `OrderFormFields.tsx` is the highest-traffic, revenue-critical conversion path in this codebase; refactoring it to share logic with a brand-new, lower-traffic cart form is not worth the regression risk for this change. If the two forms need to change together often in the future, that's the signal to revisit extraction then.

- [ ] **Step 1: Write the form**

```typescript
// src/components/store/cart/CartCheckoutForm.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import type { Store } from '@/types/database'
import { WILAYAS, DEFAULT_DELIVERY_RATES_STOPDESK, wilayaDisplayName } from '@/lib/wilayas'
import { getCommunesForWilaya } from '@/lib/communes'
import { getDeviceFingerprint, createBehaviorTracker, type BehaviorTracker } from '@/lib/fraud-shield/client-signals'
import { useTurnstile } from '@/lib/fraud-shield/use-turnstile'
import { useCart } from './CartProvider'
import { Loader2, CheckCircle } from 'lucide-react'

function validateAlgerianPhone(phone: string) {
  return /^(05|06|07)\d{8}$/.test(phone.replace(/\s/g, ''))
}

interface Props {
  store: Store
  isRTL: boolean
  onSuccess: () => void
}

export default function CartCheckoutForm({ store, isRTL, onSuccess }: Props) {
  const { items, totalPrice, clear } = useCart()
  const theme = store.theme?.config
  const primary = theme?.colors.primary ?? '#3B82F6'
  const cardBg = theme?.colors.card ?? '#111118'
  const text = theme?.colors.text ?? '#FFFFFF'
  const textMuted = theme?.colors.textMuted ?? '#9CA3AF'
  const border = theme?.colors.border ?? 'rgba(255,255,255,0.1)'

  const [form, setForm] = useState({ customer_name: '', customer_phone: '', wilaya: '', commune: '' })
  const [deliveryType, setDeliveryType] = useState<'home' | 'desk'>('home')
  const stopdeskEnabled = store.settings?.stopdeskEnabled !== false
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const fraudShieldEnabled = !!store.fraud_shield_enabled
  const [deviceFingerprint, setDeviceFingerprint] = useState<string | null>(null)
  const behaviorTrackerRef = useRef<BehaviorTracker | null>(null)
  const { containerRef: turnstileRef, token: turnstileToken } = useTurnstile(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    fraudShieldEnabled,
  )
  useEffect(() => {
    if (!fraudShieldEnabled) return
    getDeviceFingerprint().then(setDeviceFingerprint)
    behaviorTrackerRef.current = createBehaviorTracker()
    return () => behaviorTrackerRef.current?.dispose()
  }, [fraudShieldEnabled])

  // Mirrors the delivery-fee lookup in OrderFormFields.tsx (~lines 121-150,
  // 200-222) — see the file-level comment above for why this is duplicated
  // rather than shared.
  const mode = store.settings?.deliveryPricingMode ?? 'wilaya'
  const [fee, setFee] = useState<{ key: string; home: number | null; desk: number | null } | null>(null)
  const feeKey = !form.wilaya || mode === 'flat' ? '' : `${store.id}:${form.wilaya}`
  useEffect(() => {
    if (!feeKey) return
    let cancelled = false
    fetch(`/api/storefront/delivery-fees?storeId=${store.id}&toWilaya=${encodeURIComponent(form.wilaya)}`)
      .then(res => res.json())
      .then(data => { if (!cancelled) setFee({ key: feeKey, home: data.homeFee ?? null, desk: data.deskFee ?? null }) })
      .catch(() => { if (!cancelled) setFee({ key: feeKey, home: null, desk: null }) })
    return () => { cancelled = true }
  }, [feeKey, store.id, form.wilaya])

  const rates = store.settings?.deliveryRates
  const stopdeskRates = store.settings?.deliveryRatesStopdesk
  const defaultRate = rates?.default ?? Number(store.settings?.deliveryPrice ?? 600)
  const defaultStopdeskRate = stopdeskRates?.default ?? DEFAULT_DELIVERY_RATES_STOPDESK.default ?? defaultRate
  const wilayaRate = form.wilaya && rates && mode === 'wilaya' ? (rates[form.wilaya] ?? defaultRate) : defaultRate
  const wilayaStopdeskRate = form.wilaya && mode === 'wilaya'
    ? (stopdeskRates?.[form.wilaya] ?? DEFAULT_DELIVERY_RATES_STOPDESK[form.wilaya] ?? defaultStopdeskRate)
    : defaultStopdeskRate
  const staticRateForType = deliveryType === 'desk' ? wilayaStopdeskRate : wilayaRate
  const dynamicFeeForType = fee?.key === feeKey ? (deliveryType === 'desk' ? fee.desk : fee.home) : null
  const deliveryPrice = form.wilaya ? (mode === 'wilaya' && dynamicFeeForType !== null ? dynamicFeeForType : staticRateForType) : 0
  const total = totalPrice + deliveryPrice

  const communes = form.wilaya ? getCommunesForWilaya(form.wilaya) : []

  const recordInput = () => behaviorTrackerRef.current?.recordInput()

  const handleSubmit = async () => {
    if (!form.customer_name.trim()) { setError(isRTL ? 'الاسم مطلوب' : 'Le nom est requis.'); return }
    if (!validateAlgerianPhone(form.customer_phone)) { setError(isRTL ? 'رقم الهاتف غير صحيح' : 'Numéro invalide (05/06/07 + 8 chiffres).'); return }
    if (!form.wilaya || !form.commune.trim()) { setError(isRTL ? 'الولاية والبلدية مطلوبتان' : 'Wilaya et commune requises.'); return }

    setSubmitting(true)
    setError('')
    try {
      const signals = behaviorTrackerRef.current?.getSignals()
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: store.id,
          customer_name: form.customer_name,
          customer_phone: form.customer_phone,
          wilaya: form.wilaya,
          commune: form.commune,
          delivery_type: deliveryType,
          delivery_price: deliveryPrice,
          items: items.map(i => ({ product_id: i.productId, color: i.color, size: i.size, quantity: i.quantity })),
          source: 'form',
          turnstile_token: turnstileToken,
          device_fingerprint: deviceFingerprint,
          ...signals,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? (isRTL ? 'خطأ، حاول مجدداً' : 'Erreur, réessayez.')); return }
      setSuccess(true)
      clear()
      onSuccess()
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="p-8 flex flex-col items-center text-center gap-3">
        <CheckCircle size={40} style={{ color: primary }} />
        <p className="font-bold" style={{ color: text }}>{isRTL ? 'تم استلام طلبك!' : 'Commande reçue !'}</p>
      </div>
    )
  }

  const inputStyle = {
    width: '100%', padding: '12px 16px', borderRadius: '12px',
    background: 'rgba(255,255,255,0.05)', border: `1px solid ${border}`,
    color: text, outline: 'none', fontSize: '14px',
  } as const

  return (
    <div className="p-5 space-y-3">
      {fraudShieldEnabled && <div ref={turnstileRef} />}
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <input
        value={form.customer_name}
        onChange={e => { recordInput(); setForm(f => ({ ...f, customer_name: e.target.value })) }}
        placeholder={isRTL ? 'الاسم الكامل' : 'Nom complet'}
        style={inputStyle}
      />
      <input
        value={form.customer_phone}
        onChange={e => { recordInput(); setForm(f => ({ ...f, customer_phone: e.target.value })) }}
        placeholder="06 XX XX XX XX"
        type="tel"
        style={inputStyle}
      />
      <select
        value={form.wilaya}
        onChange={e => { recordInput(); setForm(f => ({ ...f, wilaya: e.target.value, commune: '' })) }}
        style={inputStyle}
      >
        <option value="">{isRTL ? 'اختر الولاية' : 'Choisir la wilaya'}</option>
        {WILAYAS.map(w => <option key={w} value={w}>{wilayaDisplayName(w, isRTL ? 'ar' : 'fr')}</option>)}
      </select>
      <select
        value={form.commune}
        onChange={e => { recordInput(); setForm(f => ({ ...f, commune: e.target.value })) }}
        disabled={!form.wilaya}
        style={inputStyle}
      >
        <option value="">{isRTL ? 'اختر البلدية' : 'Choisir la commune'}</option>
        {communes.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      {stopdeskEnabled && (
        <div className="grid grid-cols-2 gap-2">
          {(['home', 'desk'] as const).map(dtype => (
            <button
              key={dtype}
              type="button"
              onClick={() => setDeliveryType(dtype)}
              className="py-2.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: deliveryType === dtype ? `${primary}1a` : 'rgba(255,255,255,0.03)',
                border: `1.5px solid ${deliveryType === dtype ? primary : border}`,
                color: deliveryType === dtype ? primary : text,
              }}
            >
              {dtype === 'home' ? (isRTL ? 'للمنزل' : 'À domicile') : (isRTL ? 'مكتب التوصيل' : 'Stop desk')}
            </button>
          ))}
        </div>
      )}
      <div className="flex justify-between text-sm pt-1">
        <span style={{ color: textMuted }}>{isRTL ? 'التوصيل' : 'Livraison'}</span>
        <span style={{ color: text }}>{deliveryPrice.toLocaleString('fr-DZ')} DA</span>
      </div>
      <div className="flex justify-between text-base font-bold pb-2">
        <span style={{ color: text }}>{isRTL ? 'المجموع' : 'Total'}</span>
        <span style={{ color: primary }}>{total.toLocaleString('fr-DZ')} DA</span>
      </div>
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-3.5 rounded-2xl font-black text-sm disabled:opacity-50"
        style={{ background: primary, color: cardBg }}
      >
        {submitting
          ? <Loader2 size={16} className="animate-spin mx-auto" />
          : (isRTL ? `اطلب الآن — ${total.toLocaleString('fr-DZ')} دج` : `Commander — ${total.toLocaleString('fr-DZ')} DA`)}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit Tasks 5-7 together**

```bash
git add src/components/store/cart/CartProvider.tsx src/components/store/cart/CartWidget.tsx src/components/store/cart/CartCheckoutForm.tsx "src/app/(store)/layout.tsx" src/app/store/layout.tsx
git commit -m "feat(store): add cart widget, drawer, and multi-item checkout form"
```

---

### Task 8: "Ajouter au panier" button in `OrderFormFields`

**Files:**
- Modify: `src/components/store/OrderFormFields.tsx`

Single integration point — `OrderFormFields` is already rendered by every product-purchase surface (`themes/*/​*Landing.tsx` via each theme, `StandaloneProductView.tsx`, `StoreOrderModal.tsx`), so this one change covers all of them.

- [ ] **Step 1: Import `useCart`**

Add near the top, alongside the other lib imports (line 9-10):

```typescript
import { useCart } from './cart/CartProvider'
```

- [ ] **Step 2: Read the `product` prop and current selections into an "add to cart" handler**

`OrderFormFields` already has `product`, `selectedColor`, `form.size`, `form.quantity`, and `unitPrice` in scope. Add this near the top of the component body, right after the `unitPrice` calculation (line 57):

```typescript
  const { addItem } = useCart()
  const [addedToCart, setAddedToCart] = useState(false)

  const handleAddToCart = () => {
    if (!product) return
    addItem({
      productId: product.id,
      name: product.name,
      image: product.images[0] ?? null,
      unitPrice,
      color: selectedColor || null,
      size: form.size || null,
      quantity: form.quantity,
      pageUrl: window.location.pathname,
    })
    setAddedToCart(true)
    setTimeout(() => setAddedToCart(false), 2000)
  }
```

This reads `selectedColor` and `form.size`/`form.quantity`, which are declared further down the component (lines 75-94) — since this is a plain function body (not a separate hook), declaration order inside the component matters for readability but not correctness in JS closures **except** that `selectedColor`/`form` must already be declared before this point textually, or moved after them. Place this block immediately **after** the `form`/`uncontrolledColor`/`selectedColor` declarations (i.e., right after line 94, not line 57) to keep it valid and readable.

- [ ] **Step 3: Add the button**

In the JSX, insert a secondary button right before the existing "Commander" button (line 784):

```tsx
      {product && (
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={outOfStock}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed mb-2"
          style={{ background: 'rgba(255,255,255,0.05)', border: `1.5px solid ${border}`, color: text }}
        >
          <ShoppingBag size={16} />
          {addedToCart
            ? (isRTL ? 'أُضيف ✓' : 'Ajouté ✓')
            : (isRTL ? 'أضف إلى السلة' : 'Ajouter au panier')}
        </button>
      )}

      <button
        onClick={handleSubmit}
```

(`ShoppingBag` is already imported at line 13 for the "Commander" button's icon — no new icon import needed.)

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, open a store product page, click "Ajouter au panier" — confirm the floating cart button appears bottom-right/left with a badge showing "1". Add a second, different product from another page — confirm the badge updates to the combined count and clicking the cart icon now opens the drawer (not a redirect) since there are 2+ items. Remove one item to bring it back to 1 and confirm the icon now redirects to that product's page instead of opening a drawer.

- [ ] **Step 5: Commit**

```bash
git add src/components/store/OrderFormFields.tsx
git commit -m "feat(store): add 'Ajouter au panier' to the product order form"
```

---

### Task 9: Dashboard orders — show cart line items, adjust stock per line

**Files:**
- Modify: `src/app/(platform)/dashboard/orders/page.tsx`
- Modify: `src/lib/i18n/dictionaries/fr.ts`, `src/lib/i18n/dictionaries/ar.ts`, `src/lib/i18n/dictionaries/types.ts`

Three independent fixes in the same file: the order list must show something meaningful for a cart order (not a blank product cell), the detail modal must show the line-item breakdown, and — most importantly for correctness — the stock-adjustment logic that runs on status changes must decrement/restock **every** line item, not just a single `product_id` that cart orders don't have.

- [ ] **Step 1: Add i18n keys**

In `src/lib/i18n/dictionaries/types.ts`, add to the `orders` section:

```typescript
    multiItemSummary: string
    detailItems: string
```

In `fr.ts`'s `orders` section:

```typescript
    multiItemSummary: '{count} articles',
    detailItems: 'Articles commandés',
```

In `ar.ts`'s `orders` section:

```typescript
    multiItemSummary: '{count} منتجات',
    detailItems: 'المنتجات المطلوبة',
```

- [ ] **Step 2: Join `order_items` in the list query**

In `src/app/(platform)/dashboard/orders/page.tsx:63`, change:

```typescript
    .select('*, product:products(name, preferred_delivery_provider), landing_page:landing_pages(title)', { count: 'exact' })
```

to:

```typescript
    .select('*, product:products(name, preferred_delivery_provider), landing_page:landing_pages(title), order_items(id, product_id, product_name, color, size, quantity, unit_price, subtotal)', { count: 'exact' })
```

- [ ] **Step 3: Extend `OrderWithProduct`**

At `src/app/(platform)/dashboard/orders/page.tsx:42-45`, change:

```typescript
type OrderWithProduct = Order & {
  product?: { name: string; preferred_delivery_provider: DeliveryProvider | null } | null
  landing_page?: { title: string } | null
}
```

to:

```typescript
import type { OrderItem } from '@/types/database'

type OrderWithProduct = Order & {
  product?: { name: string; preferred_delivery_provider: DeliveryProvider | null } | null
  landing_page?: { title: string } | null
  order_items?: OrderItem[] | null
}
```

(Add the `OrderItem` import alongside the existing `import type { Order, OrderStatus, StoreSettings } from '@/types/database'` at line 9 rather than as a separate statement — combine them into one import.)

- [ ] **Step 4: Table cell — show a multi-item summary when present**

At `src/app/(platform)/dashboard/orders/page.tsx:652-660`, replace:

```tsx
                    <td className="px-5 py-4 text-dash-ink-soft max-w-[160px]">
                      <p className="truncate text-xs text-dash-ink font-semibold mb-0.5" title={order.product?.name ?? order.landing_page?.title ?? t('orders.unknownProduct')}>
                        {order.product?.name ?? order.landing_page?.title ?? t('orders.unknownProduct')}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs">{order.color && order.color !== '—' ? order.color : (order.size && order.size !== '—' ? order.size : t('orders.standardVariant'))}</p>
                        <p className="text-dash-ink-faint text-xs">×{order.quantity}</p>
                      </div>
                    </td>
```

with:

```tsx
                    <td className="px-5 py-4 text-dash-ink-soft max-w-[160px]">
                      {order.order_items && order.order_items.length > 0 ? (
                        <>
                          <p className="truncate text-xs text-dash-ink font-semibold mb-0.5" title={order.order_items.map(i => i.product_name).join(', ')}>
                            {t('orders.multiItemSummary', { count: order.order_items.length })}
                          </p>
                          <p className="truncate text-xs text-dash-ink-faint">{order.order_items.map(i => i.product_name).join(', ')}</p>
                        </>
                      ) : (
                        <>
                          <p className="truncate text-xs text-dash-ink font-semibold mb-0.5" title={order.product?.name ?? order.landing_page?.title ?? t('orders.unknownProduct')}>
                            {order.product?.name ?? order.landing_page?.title ?? t('orders.unknownProduct')}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-xs">{order.color && order.color !== '—' ? order.color : (order.size && order.size !== '—' ? order.size : t('orders.standardVariant'))}</p>
                            <p className="text-dash-ink-faint text-xs">×{order.quantity}</p>
                          </div>
                        </>
                      )}
                    </td>
```

- [ ] **Step 5: Detail modal — show the line-item breakdown**

At `src/app/(platform)/dashboard/orders/page.tsx:1016`, insert this block immediately **before** the existing `<div className="px-6 py-4 space-y-2.5 text-sm max-h-60 overflow-y-auto">`:

```tsx
              {detail.order_items && detail.order_items.length > 0 && (
                <div className="px-6 pt-4 space-y-2">
                  <p className="text-dash-ink-soft text-xs font-semibold">{t('orders.detailItems')}</p>
                  {detail.order_items.map(item => (
                    <div key={item.id} className="flex justify-between items-center bg-dash-surface-2 rounded-xl px-3 py-2 text-xs">
                      <span className="text-dash-ink">
                        {item.product_name}
                        {(item.color || item.size) ? ` (${[item.color, item.size].filter(Boolean).join(' / ')})` : ''}
                      </span>
                      <span className="text-dash-ink-soft">×{item.quantity} — {Number(item.subtotal).toLocaleString('fr-DZ')} DA</span>
                    </div>
                  ))}
                </div>
              )}
```

Then, within that following rows array (line 1017-1029), replace the `Product`/`Color`/`Size` rows so they're skipped when `order_items` already covered them:

```tsx
                {[
                  [t('orders.detailClient'), detail.customer_name],
                  [t('orders.detailPhone'), detail.customer_phone],
                  [t('orders.detailWilaya'), detail.wilaya],
                  [t('orders.detailCommune'), detail.commune],
                  ...(detail.order_items && detail.order_items.length > 0
                    ? []
                    : [
                        [t('orders.detailProduct'), detail.product?.name ?? detail.landing_page?.title ?? '—'],
                        [t('orders.detailColor'), detail.color ?? '—'],
                        [t('orders.detailSize'), detail.size ?? '—'],
                      ]),
                  [t('orders.detailQuantity'), String(detail.quantity)],
                  [t('orders.detailDeliveryType'), detail.delivery_type === 'desk' ? t('orders.deliveryTypeDesk') : t('orders.deliveryTypeHome')],
                  [t('orders.detailDelivery'), `${Number(detail.delivery_price).toLocaleString('fr-DZ')} DA`],
                  [t('orders.detailTotal'), `${Number(detail.total_price).toLocaleString('fr-DZ')} DA`],
                  [t('orders.detailSource'), orderSourceLabel(detail.source, locale) ?? detail.source],
                ].map(([k, v]) => (
```

- [ ] **Step 6: Fix stock adjustment for multi-item orders**

At `src/app/(platform)/dashboard/orders/page.tsx:262-289`, replace the whole block (from `const adjustProductStock = ...` through the closing of the `if (order && delta !== 0) { ... }` block) with:

```typescript
    // Adjust the general product stock AND the specific colour/size variant
    // pools by the same signed delta. A "Bleu / S" line only touches the
    // Bleu pool and the S pool (plus the general total), never other
    // variants. Takes an explicit quantity delta (rather than reading
    // order.quantity from closure) so it can be called once per line item
    // for a cart order, each with its own quantity.
    const adjustProductStock = async (productId: string, itemColor: string | null, itemSize: string | null, qtyDelta: number) => {
      const { data: product } = await supabase
        .from('products').select('stock, variant_stock').eq('id', productId).single()
      if (!product) return
      const nextVariant = applyVariantDelta(
        product.variant_stock as VariantStock | null,
        itemColor,
        itemSize,
        qtyDelta,
      )
      await supabase.from('products').update({
        stock: Math.max(0, product.stock + qtyDelta),
        variant_stock: nextVariant,
      }).eq('id', productId).eq('store_id', storeId)
    }

    if (order && delta !== 0) {
      if (order.order_items && order.order_items.length > 0) {
        const sign = delta > 0 ? 1 : -1
        for (const item of order.order_items) {
          if (item.product_id) await adjustProductStock(item.product_id, item.color, item.size, sign * item.quantity)
        }
      } else if (order.product_id) {
        await adjustProductStock(order.product_id, order.color, order.size, delta)
      } else if (order.landing_page_id) {
        const { data: lp } = await supabase
          .from('landing_pages').select('stock, product_id').eq('id', order.landing_page_id).single()
        if (lp?.product_id) {
          await adjustProductStock(lp.product_id, order.color, order.size, delta)
        } else if (lp && lp.stock !== null) {
          await supabase.from('landing_pages').update({ stock: Math.max(0, lp.stock + delta) }).eq('id', order.landing_page_id).eq('store_id', storeId)
        }
      }
```

The line after this block (closing the outer `if`, already present in the file) stays as-is — only the body changed.

- [ ] **Step 7: Verify manually**

In the dashboard, place a cart order with 2 different products (via the storefront, Task 7/8), then in `/dashboard/orders`: confirm the table row shows "2 articles" with both product names beneath, open the detail panel and confirm both line items are listed with correct quantities/subtotals, then change the order's status in a way that triggers stock deduction (e.g. `pending` → `confirmed`, matching whatever transition this file's `wasDeducted`/`isDeducted` logic already uses) and confirm **both** products' stock decremented by the right amount in `/dashboard/products`.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(platform)/dashboard/orders/page.tsx" src/lib/i18n/dictionaries/fr.ts src/lib/i18n/dictionaries/ar.ts src/lib/i18n/dictionaries/types.ts
git commit -m "feat(dashboard): show cart line items and fix stock adjustment for multi-item orders"
```

---

### Task 10: Courier shipping label — aggregate cart line items

**Files:**
- Modify: `src/app/api/integrations/delivery/ship/route.ts`

Without this, a cart order's courier parcel label would fall back to `order.color ?? 'Produit'` (line 60) — a meaningless label for a multi-product shipment.

- [ ] **Step 1: Join `order_items` in the order fetch**

At `src/app/api/integrations/delivery/ship/route.ts:27`, change:

```typescript
    .select('*, product:products(name)')
```

to:

```typescript
    .select('*, product:products(name), order_items(product_name, quantity)')
```

- [ ] **Step 2: Build the product list from line items when present**

At `src/app/api/integrations/delivery/ship/route.ts:60-61`, replace:

```typescript
  const productName = order.product?.name ?? order.color ?? 'Produit'
  const productList = `${productName} x${order.quantity}`
```

with:

```typescript
  const productList = order.order_items && order.order_items.length > 0
    ? order.order_items.map((i: { product_name: string; quantity: number }) => `${i.product_name} x${i.quantity}`).join(', ')
    : `${order.product?.name ?? order.color ?? 'Produit'} x${order.quantity}`
```

- [ ] **Step 3: Verify manually**

Create a shipment for a cart order with a connected courier (sandbox/test credentials) and confirm the resulting label shows both product names with their own quantities, comma-separated.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/integrations/delivery/ship/route.ts
git commit -m "fix(delivery): aggregate cart line items into the courier label"
```

---

### Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all existing tests pass, plus the new tests from Task 3 (5) and Task 4 (12).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: End-to-end manual pass in the browser**

1. Open a store's home page, browse to one product, click "Ajouter au panier" — confirm the floating cart icon appears with badge "1", and clicking it navigates to that same product's page (redirect behavior for a 1-item cart) rather than opening a drawer.
2. From that product's page, click "Ajouter au panier" again for a second unit — confirm the badge becomes "2" and clicking the icon still redirects (still only 1 distinct product/variant line).
3. Navigate to a **different** product and add it to the cart — confirm the badge now reflects the combined item count and clicking the icon opens the drawer (2+ distinct lines).
4. In the drawer, adjust a quantity, remove a line, confirm the running subtotal updates.
5. Click "Confirmer ma commande", fill in the customer form, submit — confirm a success state, that the cart badge disappears afterward, and that a new order appears in `/dashboard/orders` with the correct combined total and both line items visible (Task 9).
6. Refresh the store's home page in a fresh tab (same browser) after adding an item but before checking out — confirm the cart persists (cookie survived navigation/reload), and that DevTools → Application → Cookies shows no `localStorage`/`sessionStorage` entries used for it (cookie only).

---

## Self-review notes

- **Spec coverage:** Task 1 covers the spec's `order_items` model and the compat rule (single-item orders never touch `order_items`); Task 3 covers the "server always recomputes price" rule; Tasks 5-8 cover the global, cookie-persisted, 5-theme-agnostic cart UI and its 1-item-redirects / 2+-items-opens-drawer behavior; Task 9-10 cover the dashboard/courier consequences the spec called out explicitly ("Le libellé colis... agrège les articles", dashboard detail view). Nothing in spec Part A is left uncovered.
- **Type consistency:** `CartItem` (Task 4) is the type used end-to-end by `CartProvider`/`CartWidget`/`CartCheckoutForm`/`OrderFormFields`'s `addItem` call — same field names throughout (`productId`, `unitPrice`, `pageUrl`, etc.). `OrderItem` (Task 2) matches the `order_items` columns from Task 1's migration exactly, and is the type used by both the dashboard (Task 9) and the courier route (Task 10, inlined as a narrower local type since it only needs `product_name`/`quantity`).
- **No placeholders:** every step has complete code, exact file/line references, and exact commands. The one deliberate scope-limiting decision — duplicating (not extracting) the delivery-fee lookup between `OrderFormFields.tsx` and `CartCheckoutForm.tsx` — is documented inline with its reasoning, not left as a vague TODO.
