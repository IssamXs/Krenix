# Stop-desk Delivery Option Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stop-desk delivery choice to the customer order form, with correct per-wilaya default pricing, and wire the customer's choice through to Yalidine's automatic shipment creation (which already supports it but has never had a caller set it).

**Architecture:** Additive data model — a new `deliveryRatesStopdesk` sibling to the existing `deliveryRates` store setting, and a new `delivery_type` column on `orders` defaulting to `'home'` so every past order stays correctly interpreted. The customer's choice flows: order form → `/api/orders` → stored on the order → `/api/integrations/delivery/ship` reads it → passed to Yalidine's already-built `isStopdesk` parameter.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (Postgres), Tailwind, Vitest.

---

## Reference: full spec

See `docs/superpowers/specs/2026-08-04-stopdesk-delivery-design.md` for the approved design (full corrected pricing table, data model rationale, scope boundaries).

---

### Task 1: Database migration — `orders.delivery_type`

**Files:**
- Create: `Database/047_delivery_type.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- 047 — Stop-desk delivery type on orders
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: customers can now choose home delivery ("domicile") or stop-desk
-- pickup on the order form. Every order needs to record which one was
-- chosen so dashboard fulfillment and automatic Yalidine shipment creation
-- (which already supports stop-desk at the API level) know which to use.
-- Existing orders default to 'home' — the only option that existed before
-- this change, so this is a correct backfill, not a guess.
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_type TEXT NOT NULL DEFAULT 'home';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_delivery_type_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_delivery_type_check
      CHECK (delivery_type IN ('home', 'desk'));
  END IF;
END $$;
```

- [ ] **Step 2: Deliver the SQL to the user**

Paste the full SQL above in chat (or an artifact) so the user can run it in
Supabase → SQL Editor. This must be run before Tasks 6–7 (order creation,
shipment creation) and Task 10 (orders dashboard) will work against real
data — until then, `delivery_type` doesn't exist as a column.

- [ ] **Step 3: Commit**

```bash
git add Database/047_delivery_type.sql
git commit -m "feat(db): add delivery_type column to orders (home/desk)"
```

---

### Task 2: Corrected default pricing + new stop-desk table

**Files:**
- Modify: `src/lib/wilayas.ts`

- [ ] **Step 1: Fix two existing mismatches and add the stop-desk table**

In `DEFAULT_DELIVERY_RATES`, two values are wrong relative to the source
rate sheet (verified during design):
- `"El Bayadh": 800` must become `"El Bayadh": 1600` (it's Zone 4, not
  Zone 3) — currently listed under the `// Zone 3 — Pre-Saharan` comment
  block; move it to the `// Zone 4/5 — Deep south (Sahara)` block.
- `"Tipaza": 500` must become `"Tipaza": 650` (it's Zone 2, not Zone 1) —
  currently listed under `// Zone 1 — Algérois`; move it to
  `// Zone 2 — North / Centre`.

After those two fixes, add a new export `DEFAULT_DELIVERY_RATES_STOPDESK`
right after the closing `}` of `DEFAULT_DELIVERY_RATES`:

```typescript
/**
 * Default stop-desk (pickup point) delivery rates (DZD), same source sheet
 * as DEFAULT_DELIVERY_RATES's "Tarif stop-desk" column.
 */
export const DEFAULT_DELIVERY_RATES_STOPDESK: Record<string, number> = {
  default: 550,
  // Zone 1 — Algérois
  "Alger": 350,
  "Blida": 400,
  "Boumerdès": 400,
  // Zone 2 — North / Centre
  "Tipaza": 550,
  "Chlef": 550,
  "Oum El Bouaghi": 550,
  "Batna": 550,
  "Béjaïa": 550,
  "Bouira": 550,
  "Tlemcen": 550,
  "Tiaret": 550,
  "Tizi Ouzou": 550,
  "Jijel": 550,
  "Sétif": 550,
  "Saïda": 550,
  "Skikda": 550,
  "Sidi Bel Abbès": 550,
  "Annaba": 550,
  "Guelma": 550,
  "Constantine": 550,
  "Médéa": 550,
  "Mostaganem": 550,
  "M'Sila": 550,
  "Mascara": 550,
  "Oran": 550,
  "Bordj Bou Arréridj": 550,
  "El Tarf": 550,
  "Tissemsilt": 550,
  "Khenchela": 550,
  "Souk Ahras": 550,
  "Mila": 550,
  "Aïn Defla": 550,
  "Aïn Témouchent": 550,
  "Relizane": 550,
  // Zone 3 — Pre-Saharan
  "Laghouat": 650,
  "Biskra": 650,
  "Tébessa": 650,
  "Djelfa": 650,
  "El Bayadh": 1500,
  "Ouargla": 650,
  "El Oued": 650,
  "Ghardaïa": 650,
  "Ouled Djellal": 650,
  "Touggourt": 650,
  "El M'Ghair": 650,
  "El Meniaa": 650,
  // Zone 4/5 — Deep south (Sahara)
  "Adrar": 1500,
  "Béchar": 1500,
  "Tamanrasset": 1500,
  "Illizi": 1500,
  "Tindouf": 1500,
  "Naâma": 1500,
  "Timimoun": 1500,
  "Bordj Badji Mokhtar": 1500,
  "Béni Abbès": 1500,
  "In Salah": 1500,
  "In Guezzam": 1500,
  "Djanet": 1500,
}
```

Note: `"El Bayadh": 1500` is listed under the Zone 3 comment block above to
mirror exactly where `DEFAULT_DELIVERY_RATES` (after Step 1's fix) places
its own now-corrected `"El Bayadh": 1600` entry — keep both files' comment
groupings consistent with each other, even though El Bayadh's *true* zone is
4; this matches the existing (pre-fix) file's own grouping quirk for that
wilaya and avoids a confusing mismatch between the two tables' visual
layout. (If in doubt, prioritize correct **values** over which comment
block a line sits under — the values above are the authoritative part.)

- [ ] **Step 2: Verify against the wilaya count**

Both `DEFAULT_DELIVERY_RATES` and `DEFAULT_DELIVERY_RATES_STOPDESK` must
have exactly 58 wilaya keys plus `default` (59 total keys each). Count them
after editing — every name in `WILAYAS` (`src/lib/wilayas.ts`) must appear
in both tables with no typos (cross-check spelling against the `WILAYAS`
array in the same file, e.g. `"Bordj Bou Arréridj"`, `"Aïn Defla"`,
`"Aïn Témouchent"`, `"M'Sila"` — accented/apostrophe spelling must match
exactly since these are used as object keys looked up by wilaya name
elsewhere in the app).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/wilayas.ts
git commit -m "fix: correct El Bayadh/Tipaza delivery zones, add stop-desk default rates"
```

---

### Task 3: Type updates

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add `deliveryRatesStopdesk` to `StoreSettings`**

Find the existing field (around line 108):

```typescript
  deliveryRates?: { default: number; [wilaya: string]: number }
```

Add a new field immediately after it:

```typescript
  deliveryRates?: { default: number; [wilaya: string]: number }
  // Stop-desk (pickup point) equivalent of deliveryRates, same shape.
  // Absent = falls back to DEFAULT_DELIVERY_RATES_STOPDESK (lib/wilayas.ts).
  deliveryRatesStopdesk?: { default: number; [wilaya: string]: number }
```

- [ ] **Step 2: Add `delivery_type` to `Order`**

Find the existing field (around line 429):

```typescript
  delivery_price: number
```

Add a new field immediately after it:

```typescript
  delivery_price: number
  // Customer's chosen delivery method. Defaults to 'home' at the DB level
  // for every order that existed before this field was introduced.
  delivery_type: 'home' | 'desk'
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add deliveryRatesStopdesk and Order.delivery_type types"
```

---

### Task 4: Courier adapter — accept `isStopdesk`

**Files:**
- Modify: `src/lib/couriers.ts`

- [ ] **Step 1: Add the field to the shared parcel input type**

Find `CourierParcelInput` (around line 20):

```typescript
export interface CourierParcelInput {
  orderNumber: string
  fromWilaya: string
  firstname: string
  familyname: string
  phone: string
  address: string
  toWilaya: string
  toCommune: string
  productList: string
  codAmount: number
}
```

Add one field:

```typescript
export interface CourierParcelInput {
  orderNumber: string
  fromWilaya: string
  firstname: string
  familyname: string
  phone: string
  address: string
  toWilaya: string
  toCommune: string
  productList: string
  codAmount: number
  // Only Yalidine's adapter currently reads this (src/lib/yalidine.ts already
  // accepts it as YalidineParcelInput.isStopdesk); other adapters ignore it.
  isStopdesk?: boolean
}
```

This requires no other change in this file: the Yalidine wrapper
(`createParcel: (c, p) => createYalidineParcel({ apiId: c.apiId, apiToken: c.apiToken }, p)`)
already forwards the whole `p` object, so `isStopdesk` now flows through
automatically once the caller (Task 6) sets it.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/couriers.ts
git commit -m "feat: add isStopdesk to the shared courier parcel input type"
```

---

### Task 5: Storefront delivery-fees API — return both home and desk fees

**Files:**
- Modify: `src/app/api/storefront/delivery-fees/route.ts`

- [ ] **Step 1: Read the current file**

Read `src/app/api/storefront/delivery-fees/route.ts` in full (69 lines) —
it's short. It currently has 4 early-return points that all return
`{ fee: null }`, and one final block that averages Yalidine's per-commune
`home` fees into a single `{ fee: avg }`.

- [ ] **Step 2: Normalize the early returns**

Replace every occurrence of:

```typescript
    return NextResponse.json({ fee: null })
```

with:

```typescript
    return NextResponse.json({ homeFee: null, deskFee: null })
```

(There are 4 such lines: after the `!integration` check, after the
`!fromId || !toId` check, in the `catch` block for `decryptToken`, and after
the `!fees || !fees.communes` check. Replace all 4.)

- [ ] **Step 3: Replace the final averaging block**

Find:

```typescript
  // The destination wilaya might have multiple communes, but for a general "wilaya" selection
  // we take the first commune's home delivery price, or an average/default if we can.
  // Yalidine usually has standard prices per wilaya.
  const validFees = fees.communes.map(c => c.home).filter(f => f !== null) as number[]
  if (validFees.length === 0) {
    return NextResponse.json({ fee: null })
  }

  // Average or just the most common fee for the wilaya (often they are all the same).
  const avg = Math.round(validFees.reduce((a, b) => a + b, 0) / validFees.length)
  
  return NextResponse.json({ fee: avg })
```

Replace with:

```typescript
  // The destination wilaya might have multiple communes; average across them
  // for a general "wilaya" selection (often they're all the same anyway).
  // Compute both home and stop-desk averages — the storefront now offers
  // both delivery types and needs a live price for whichever the customer
  // picks.
  const avgFee = (values: (number | null)[]): number | null => {
    const valid = values.filter((f): f is number => f !== null)
    return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null
  }

  const homeFee = avgFee(fees.communes.map(c => c.home))
  const deskFee = avgFee(fees.communes.map(c => c.desk))

  return NextResponse.json({ homeFee, deskFee })
```

(Note this no longer early-returns when both are null — an empty
`{ homeFee: null, deskFee: null }` response is already handled correctly by
the caller in Task 8, same as the other early-return points.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/storefront/delivery-fees/route.ts
git commit -m "feat: return both home and stop-desk fees from the delivery-fees API"
```

---

### Task 6: Order creation API — accept and validate `delivery_type`

**Files:**
- Modify: `src/app/api/orders/route.ts`

- [ ] **Step 1: Destructure the new field from the request body**

Find (around line 36-40):

```typescript
    const body = await request.json()
    const {
      store_id, product_id, landing_page_id, variant,
      customer_name, customer_phone, wilaya, commune,
      color, size, quantity, unit_price, delivery_price, total_price,
      source, notes,
      turnstile_token, device_fingerprint, time_on_page_ms, had_movement, form_fill_ms,
    } = body
```

Replace with:

```typescript
    const body = await request.json()
    const {
      store_id, product_id, landing_page_id, variant,
      customer_name, customer_phone, wilaya, commune,
      color, size, quantity, unit_price, delivery_price, total_price,
      source, notes, delivery_type,
      turnstile_token, device_fingerprint, time_on_page_ms, had_movement, form_fill_ms,
    } = body
```

- [ ] **Step 2: Validate and include it in the insert payload**

Find (around line 115-133) the `insertPayload` object. It currently has:

```typescript
      unit_price: Number(unit_price) || 0,
      delivery_price: Number(delivery_price) || 0,
      total_price: Number(total_price) || 0,
      status: 'pending',
```

Replace with:

```typescript
      unit_price: Number(unit_price) || 0,
      delivery_price: Number(delivery_price) || 0,
      total_price: Number(total_price) || 0,
      // Never trust an arbitrary client string for a column with a DB CHECK
      // constraint — normalize anything that isn't exactly 'desk' to 'home'.
      delivery_type: delivery_type === 'desk' ? 'desk' : 'home',
      status: 'pending',
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/orders/route.ts
git commit -m "feat: accept and store delivery_type on order creation"
```

---

### Task 7: Shipment creation — pass `isStopdesk` to Yalidine

**Files:**
- Modify: `src/app/api/integrations/delivery/ship/route.ts`

- [ ] **Step 1: Add `isStopdesk` to the `createParcel` call**

Find (around line 70-81):

```typescript
  const result = await adapter.createParcel(creds, {
    orderNumber: order.order_number,
    fromWilaya: integration.from_wilaya ?? '',
    firstname,
    familyname,
    phone: order.customer_phone,
    address: order.address || `${order.commune}, ${order.wilaya}`,
    toWilaya: order.wilaya,
    toCommune: order.commune,
    productList,
    codAmount: Number(order.total_price),
  })
```

Replace with:

```typescript
  const result = await adapter.createParcel(creds, {
    orderNumber: order.order_number,
    fromWilaya: integration.from_wilaya ?? '',
    firstname,
    familyname,
    phone: order.customer_phone,
    address: order.address || `${order.commune}, ${order.wilaya}`,
    toWilaya: order.wilaya,
    toCommune: order.commune,
    productList,
    codAmount: Number(order.total_price),
    isStopdesk: order.delivery_type === 'desk',
  })
```

No query change is needed — the order is already fetched with
`.select('*, product:products(name)')` (line 27), so `order.delivery_type`
is already present on the fetched row once migration 047 (Task 1) has run.
Only Yalidine's adapter (`src/lib/yalidine.ts`) reads `isStopdesk`; Maystro,
ZR Express, and Procolis/WeCan adapters simply ignore the extra field
(matches the confirmed "capture-only for other couriers" scope).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/integrations/delivery/ship/route.ts"
git commit -m "feat: pass customer's stop-desk choice to Yalidine shipment creation"
```

---

### Task 8: Customer order form — delivery-type selector + price calc

**Files:**
- Modify: `src/components/store/OrderFormFields.tsx`

- [ ] **Step 1: Change the dynamic-fee state shape**

Find (around line 83):

```typescript
  const [dynamicDeliveryFee, setDynamicDeliveryFee] = useState<number | null>(null)
```

Replace with:

```typescript
  const [dynamicDeliveryFee, setDynamicDeliveryFee] = useState<{ home: number | null; desk: number | null } | null>(null)
  const [deliveryType, setDeliveryType] = useState<'home' | 'desk'>('home')
```

- [ ] **Step 2: Update the live-fee fetch effect**

Find (around line 104-122):

```typescript
  // Fetch live delivery fees when Wilaya changes
  useEffect(() => {
    if (!form.wilaya || !store.id || mode === 'flat') {
      setDynamicDeliveryFee(null)
      return
    }
    setFetchingFee(true)
    fetch(`/api/storefront/delivery-fees?storeId=${store.id}&toWilaya=${encodeURIComponent(form.wilaya)}`)
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.fee === 'number') {
          setDynamicDeliveryFee(data.fee)
        } else {
          setDynamicDeliveryFee(null)
        }
      })
      .catch(() => setDynamicDeliveryFee(null))
      .finally(() => setFetchingFee(false))
  }, [form.wilaya, store.id, mode])
```

Replace with:

```typescript
  // Fetch live delivery fees when Wilaya changes
  useEffect(() => {
    if (!form.wilaya || !store.id || mode === 'flat') {
      setDynamicDeliveryFee(null)
      return
    }
    setFetchingFee(true)
    fetch(`/api/storefront/delivery-fees?storeId=${store.id}&toWilaya=${encodeURIComponent(form.wilaya)}`)
      .then(res => res.json())
      .then(data => {
        if (data && (typeof data.homeFee === 'number' || typeof data.deskFee === 'number')) {
          setDynamicDeliveryFee({ home: data.homeFee ?? null, desk: data.deskFee ?? null })
        } else {
          setDynamicDeliveryFee(null)
        }
      })
      .catch(() => setDynamicDeliveryFee(null))
      .finally(() => setFetchingFee(false))
  }, [form.wilaya, store.id, mode])
```

- [ ] **Step 3: Update the price calculation**

Find (around line 172-194):

```typescript
  const rates = store.settings?.deliveryRates
  const defaultRate = rates?.default ?? Number(store.settings?.deliveryPrice ?? 600)
  const wilayaRate = form.wilaya && rates && mode === 'wilaya'
    ? (rates[form.wilaya] ?? defaultRate)
    : defaultRate

  // Quantity is capped by the tightest applicable stock: the chosen colour's
  // pool, the chosen size's pool, then the product's general stock. Untracked
  // pools contribute no cap (Infinity).
  const colorMax = colorRemaining(variantStock, form.color)
  const sizeMax = sizeRemaining(variantStock, form.size)
  const variantMax = Math.min(colorMax ?? Infinity, sizeMax ?? Infinity)
  const maxQty = Number.isFinite(variantMax) ? variantMax : (product?.stock ?? 999)
  const outOfStock = maxQty <= 0

  const subtotal = unitPrice * form.quantity
  const rawDelivery = form.wilaya
    ? (mode === 'wilaya' && dynamicDeliveryFee !== null ? dynamicDeliveryFee : wilayaRate) 
    : 0
```

Replace with:

```typescript
  const rates = store.settings?.deliveryRates
  const stopdeskRates = store.settings?.deliveryRatesStopdesk
  const defaultRate = rates?.default ?? Number(store.settings?.deliveryPrice ?? 600)
  const defaultStopdeskRate = stopdeskRates?.default ?? defaultRate
  const wilayaRate = form.wilaya && rates && mode === 'wilaya'
    ? (rates[form.wilaya] ?? defaultRate)
    : defaultRate
  const wilayaStopdeskRate = form.wilaya && stopdeskRates && mode === 'wilaya'
    ? (stopdeskRates[form.wilaya] ?? defaultStopdeskRate)
    : defaultStopdeskRate
  const staticRateForType = deliveryType === 'desk' ? wilayaStopdeskRate : wilayaRate
  const dynamicFeeForType = deliveryType === 'desk' ? (dynamicDeliveryFee?.desk ?? null) : (dynamicDeliveryFee?.home ?? null)

  // Quantity is capped by the tightest applicable stock: the chosen colour's
  // pool, the chosen size's pool, then the product's general stock. Untracked
  // pools contribute no cap (Infinity).
  const colorMax = colorRemaining(variantStock, form.color)
  const sizeMax = sizeRemaining(variantStock, form.size)
  const variantMax = Math.min(colorMax ?? Infinity, sizeMax ?? Infinity)
  const maxQty = Number.isFinite(variantMax) ? variantMax : (product?.stock ?? 999)
  const outOfStock = maxQty <= 0

  const subtotal = unitPrice * form.quantity
  const rawDelivery = form.wilaya
    ? (mode === 'wilaya' && dynamicFeeForType !== null ? dynamicFeeForType : staticRateForType)
    : 0
```

- [ ] **Step 4: Add the delivery-type toggle to the form**

Find the commune field block, which ends right before the `{/* Customer note */}` comment (around line 560-565):

```tsx
        })()}
      </div>

      {/* Customer note */}
```

Insert a new block between them:

```tsx
        })()}
      </div>

      {/* Delivery type */}
      <div>
        <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
          {isRTL ? 'طريقة التوصيل' : 'Mode de livraison'}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {([
            { key: 'home' as const, label: isRTL ? 'إلى المنزل' : 'Domicile' },
            { key: 'desk' as const, label: isRTL ? 'نقطة استلام (Stop-desk)' : 'Stop-desk' },
          ]).map(opt => {
            const selected = deliveryType === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setDeliveryType(opt.key)}
                className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: selected ? `${primary}1a` : 'rgba(255,255,255,0.03)',
                  border: `1.5px solid ${selected ? primary : border}`,
                  color: selected ? primary : text,
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Customer note */}
```

(This mirrors the existing payment-method button-pair styling later in the
same file for visual consistency — same button shape, same selected-state
treatment.)

- [ ] **Step 5: Send the choice with the order**

Find (around line 260-286) the `fetch('/api/orders', ...)` call's JSON body.
It currently has:

```typescript
          quantity: form.quantity,
          unit_price: unitPrice,
          delivery_price: finalDelivery,
          total_price: total,
```

Replace with:

```typescript
          quantity: form.quantity,
          unit_price: unitPrice,
          delivery_price: finalDelivery,
          delivery_type: deliveryType,
          total_price: total,
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/store/OrderFormFields.tsx
git commit -m "feat: add delivery-type selector to the customer order form"
```

---

### Task 9: Dashboard settings — stop-desk rate editor

**Files:**
- Modify: `src/app/(platform)/dashboard/settings/page.tsx`
- Modify: `src/lib/i18n/dictionaries/fr.ts`
- Modify: `src/lib/i18n/dictionaries/ar.ts`
- Modify: `src/lib/i18n/dictionaries/types.ts`

- [ ] **Step 1: Add the two new i18n keys**

In `src/lib/i18n/dictionaries/fr.ts`, find (around line 376):

```typescript
    deliveryRatesHint: 'Définissez un tarif par défaut et personnalisez wilaya par wilaya.',
    modeFlat: 'Tarif par défaut',
```

Insert between them:

```typescript
    deliveryRatesHint: 'Définissez un tarif par défaut et personnalisez wilaya par wilaya.',
    deliveryRatesStopdeskTitle: 'Tarifs stop-desk par wilaya',
    deliveryRatesStopdeskHint: 'Prix pour un retrait en point relais (stop-desk), par wilaya.',
    modeFlat: 'Tarif par défaut',
```

In `src/lib/i18n/dictionaries/ar.ts`, find the equivalent `deliveryRatesHint`
line (same relative position, around line 376) and insert the Arabic
equivalents right after it, in the same style as the neighboring keys:

```typescript
    deliveryRatesStopdeskTitle: 'أسعار الستوب ديسك حسب الولاية',
    deliveryRatesStopdeskHint: 'سعر الاستلام من نقطة التوصيل (ستوب ديسك)، حسب الولاية.',
```

In `src/lib/i18n/dictionaries/types.ts`, find the `deliveryRatesTitle:
string` / `applyToAll: string` block (around line 375) and add the two new
keys to the shared `Dictionary` shape so both fr.ts and ar.ts stay
type-checked against it:

```typescript
    deliveryRatesStopdeskTitle: string
    deliveryRatesStopdeskHint: string
```

- [ ] **Step 2: Add imports and state**

In `src/app/(platform)/dashboard/settings/page.tsx`, find:

```typescript
import { WILAYAS, DEFAULT_DELIVERY_RATES } from '@/lib/wilayas'
```

Replace with:

```typescript
import { WILAYAS, DEFAULT_DELIVERY_RATES, DEFAULT_DELIVERY_RATES_STOPDESK } from '@/lib/wilayas'
```

Find (around line 38):

```typescript
  const [deliveryRates, setDeliveryRates] = useState<Record<string, number>>({ default: 600 })
  const [deliveryPricingMode, setDeliveryPricingMode] = useState<'flat' | 'wilaya'>('wilaya')
```

Add two new state variables right after:

```typescript
  const [deliveryRates, setDeliveryRates] = useState<Record<string, number>>({ default: 600 })
  const [deliveryPricingMode, setDeliveryPricingMode] = useState<'flat' | 'wilaya'>('wilaya')
  const [deliveryRatesStopdesk, setDeliveryRatesStopdesk] = useState<Record<string, number>>({ default: 550 })
  const [showAllWilayasStopdesk, setShowAllWilayasStopdesk] = useState(false)
```

- [ ] **Step 3: Load existing (or default) stop-desk rates**

Find (around line 81-83):

```typescript
      const existing = data.settings?.deliveryRates
      setDeliveryRates(existing && Object.keys(existing).length > 1 ? existing : { ...DEFAULT_DELIVERY_RATES })
      setDeliveryPricingMode(data.settings?.deliveryPricingMode ?? 'wilaya')
```

Replace with:

```typescript
      const existing = data.settings?.deliveryRates
      setDeliveryRates(existing && Object.keys(existing).length > 1 ? existing : { ...DEFAULT_DELIVERY_RATES })
      setDeliveryPricingMode(data.settings?.deliveryPricingMode ?? 'wilaya')
      const existingStopdesk = data.settings?.deliveryRatesStopdesk
      setDeliveryRatesStopdesk(existingStopdesk && Object.keys(existingStopdesk).length > 1 ? existingStopdesk : { ...DEFAULT_DELIVERY_RATES_STOPDESK })
```

- [ ] **Step 4: Include it in the save payload**

Find (around line 102):

```typescript
        deliveryRates, deliveryPricingMode,
        deliveryPrice: deliveryRates.default ?? 600,
```

Replace with:

```typescript
        deliveryRates, deliveryPricingMode,
        deliveryPrice: deliveryRates.default ?? 600,
        deliveryRatesStopdesk,
```

- [ ] **Step 5: Add helper functions**

Find (around line 174-184):

```typescript
  const setWilayaRate = (wilaya: string, val: string) => {
    const num = Number(val)
    setDeliveryRates(r => ({ ...r, [wilaya]: isNaN(num) ? 0 : num }))
  }

  const applyDefaultToAll = () => {
    const def = deliveryRates.default ?? 600
    const all: Record<string, number> = { default: def }
    WILAYAS.forEach(w => { all[w] = def })
    setDeliveryRates(all)
  }
```

Add two mirror functions right after:

```typescript
  const setWilayaRate = (wilaya: string, val: string) => {
    const num = Number(val)
    setDeliveryRates(r => ({ ...r, [wilaya]: isNaN(num) ? 0 : num }))
  }

  const applyDefaultToAll = () => {
    const def = deliveryRates.default ?? 600
    const all: Record<string, number> = { default: def }
    WILAYAS.forEach(w => { all[w] = def })
    setDeliveryRates(all)
  }

  const setWilayaStopdeskRate = (wilaya: string, val: string) => {
    const num = Number(val)
    setDeliveryRatesStopdesk(r => ({ ...r, [wilaya]: isNaN(num) ? 0 : num }))
  }

  const applyStopdeskDefaultToAll = () => {
    const def = deliveryRatesStopdesk.default ?? 550
    const all: Record<string, number> = { default: def }
    WILAYAS.forEach(w => { all[w] = def })
    setDeliveryRatesStopdesk(all)
  }
```

- [ ] **Step 6: Add the new card to the JSX**

Find the closing of the existing delivery-rates `<Card>` (around line
422-445):

```tsx
        {deliveryPricingMode === 'wilaya' && (
          <div>
            <label className={LABEL}>{t('settings.perWilayaLabel')}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {displayedWilayas.map(wilaya => (
                <div key={wilaya} className="flex items-center gap-2">
                  <span className="text-dash-ink-soft text-xs w-24 sm:w-28 truncate flex-shrink-0">{wilaya}</span>
                  <input
                    type="number"
                    value={deliveryRates[wilaya] ?? deliveryRates.default ?? 600}
                    onChange={e => setWilayaRate(wilaya, e.target.value)}
                    className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-dash-surface-2 border border-dash-border text-dash-ink text-xs outline-none focus:border-dash-accent/50 transition-all"
                  />
                  <span className="text-dash-ink-faint text-xs flex-shrink-0">DZD</span>
                </div>
              ))}
            </div>
            <button onClick={() => setShowAllWilayas(v => !v)} className="mt-3 flex items-center gap-1.5 text-xs text-dash-ink-soft hover:text-dash-ink transition-colors">
              {showAllWilayas ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showAllWilayas ? t('settings.showLess') : t('settings.showAllWilayas', { count: WILAYAS.length })}
            </button>
          </div>
        )}
      </Card>

      <motion.button
```

Replace with (adds a new, separate `<Card>` for stop-desk rates right after
the existing one, before the save button):

```tsx
        {deliveryPricingMode === 'wilaya' && (
          <div>
            <label className={LABEL}>{t('settings.perWilayaLabel')}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {displayedWilayas.map(wilaya => (
                <div key={wilaya} className="flex items-center gap-2">
                  <span className="text-dash-ink-soft text-xs w-24 sm:w-28 truncate flex-shrink-0">{wilaya}</span>
                  <input
                    type="number"
                    value={deliveryRates[wilaya] ?? deliveryRates.default ?? 600}
                    onChange={e => setWilayaRate(wilaya, e.target.value)}
                    className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-dash-surface-2 border border-dash-border text-dash-ink text-xs outline-none focus:border-dash-accent/50 transition-all"
                  />
                  <span className="text-dash-ink-faint text-xs flex-shrink-0">DZD</span>
                </div>
              ))}
            </div>
            <button onClick={() => setShowAllWilayas(v => !v)} className="mt-3 flex items-center gap-1.5 text-xs text-dash-ink-soft hover:text-dash-ink transition-colors">
              {showAllWilayas ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showAllWilayas ? t('settings.showLess') : t('settings.showAllWilayas', { count: WILAYAS.length })}
            </button>
          </div>
        )}
      </Card>

      <Card delayMs={270} className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck size={16} className="text-dash-accent" />
            <h3 className="text-dash-ink font-bold">{t('settings.deliveryRatesStopdeskTitle')}</h3>
          </div>
          <button onClick={applyStopdeskDefaultToAll} className="text-xs text-dash-accent hover:text-dash-accent-dark transition-colors font-semibold">
            {t('settings.applyToAll')}
          </button>
        </div>
        <p className="text-dash-ink-soft text-xs">{t('settings.deliveryRatesStopdeskHint')}</p>

        <div>
          <label className={LABEL}>{t('settings.perWilayaLabel')}</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(showAllWilayasStopdesk ? WILAYAS : PRIORITY_WILAYAS).map(wilaya => (
              <div key={wilaya} className="flex items-center gap-2">
                <span className="text-dash-ink-soft text-xs w-24 sm:w-28 truncate flex-shrink-0">{wilaya}</span>
                <input
                  type="number"
                  value={deliveryRatesStopdesk[wilaya] ?? deliveryRatesStopdesk.default ?? 550}
                  onChange={e => setWilayaStopdeskRate(wilaya, e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-dash-surface-2 border border-dash-border text-dash-ink text-xs outline-none focus:border-dash-accent/50 transition-all"
                />
                <span className="text-dash-ink-faint text-xs flex-shrink-0">DZD</span>
              </div>
            ))}
          </div>
          <button onClick={() => setShowAllWilayasStopdesk(v => !v)} className="mt-3 flex items-center gap-1.5 text-xs text-dash-ink-soft hover:text-dash-ink transition-colors">
            {showAllWilayasStopdesk ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showAllWilayasStopdesk ? t('settings.showLess') : t('settings.showAllWilayas', { count: WILAYAS.length })}
          </button>
        </div>
      </Card>

      <motion.button
```

Note: `PRIORITY_WILAYAS` is already defined earlier in this same component
(`const PRIORITY_WILAYAS = ['Alger', 'Oran', ...]`, around line 189) — reuse
it directly, don't redeclare it.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(platform)/dashboard/settings/page.tsx" src/lib/i18n/dictionaries/fr.ts src/lib/i18n/dictionaries/ar.ts src/lib/i18n/dictionaries/types.ts
git commit -m "feat: add stop-desk delivery rate editor to dashboard settings"
```

---

### Task 10: Dashboard orders — delivery-type visibility

**Files:**
- Modify: `src/app/(platform)/dashboard/orders/page.tsx`
- Modify: `src/lib/i18n/dictionaries/fr.ts`
- Modify: `src/lib/i18n/dictionaries/ar.ts`
- Modify: `src/lib/i18n/dictionaries/types.ts`

- [ ] **Step 1: Add i18n keys**

In `src/lib/i18n/dictionaries/fr.ts`, find (around line 231):

```typescript
    colWilaya: 'Wilaya',
```

Insert after it:

```typescript
    colWilaya: 'Wilaya',
    deliveryTypeHome: 'Domicile',
    deliveryTypeDesk: 'Stop-desk',
```

Find (around line 256):

```typescript
    detailWilaya: 'Wilaya',
```

Insert after it:

```typescript
    detailWilaya: 'Wilaya',
    detailDeliveryType: 'Mode de livraison',
```

In `src/lib/i18n/dictionaries/ar.ts`, find the equivalent `colWilaya` line
and insert the Arabic equivalents right after it, matching the surrounding
keys' style:

```typescript
    deliveryTypeHome: 'المنزل',
    deliveryTypeDesk: 'ستوب ديسك',
```

And find the equivalent `detailWilaya` line, insert right after:

```typescript
    detailDeliveryType: 'طريقة التوصيل',
```

In `src/lib/i18n/dictionaries/types.ts`, find the `orders` section's
`colWilaya: string` and `detailWilaya: string` entries and add the 3 new
keys next to their respective siblings so both dictionaries stay
type-checked:

```typescript
    deliveryTypeHome: string
    deliveryTypeDesk: string
```

and

```typescript
    detailDeliveryType: string
```

- [ ] **Step 2: Add the chip to the orders list table**

Find (around line 365):

```tsx
                    <td className="px-5 py-4 text-dash-ink-soft">{order.wilaya}</td>
```

Replace with:

```tsx
                    <td className="px-5 py-4 text-dash-ink-soft">
                      {order.wilaya}
                      <span className={`block mt-1 w-fit text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        order.delivery_type === 'desk' ? 'bg-dash-info-soft text-dash-info' : 'bg-dash-neutral-soft text-dash-neutral'
                      }`}>
                        {order.delivery_type === 'desk' ? t('orders.deliveryTypeDesk') : t('orders.deliveryTypeHome')}
                      </span>
                    </td>
```

- [ ] **Step 3: Add the row to the order detail modal**

Find (around line 621-633):

```tsx
              <div className="px-6 py-4 space-y-2.5 text-sm max-h-60 overflow-y-auto">
                {[
                  [t('orders.detailClient'), detail.customer_name],
                  [t('orders.detailPhone'), detail.customer_phone],
                  [t('orders.detailWilaya'), detail.wilaya],
                  [t('orders.detailCommune'), detail.commune],
                  [t('orders.detailProduct'), detail.product?.name ?? detail.landing_page?.title ?? '—'],
                  [t('orders.detailColor'), detail.color ?? '—'],
                  [t('orders.detailSize'), detail.size ?? '—'],
                  [t('orders.detailQuantity'), String(detail.quantity)],
                  [t('orders.detailDelivery'), `${Number(detail.delivery_price).toLocaleString('fr-DZ')} DA`],
                  [t('orders.detailTotal'), `${Number(detail.total_price).toLocaleString('fr-DZ')} DA`],
                  [t('orders.detailSource'), orderSourceLabel(detail.source, locale) ?? detail.source],
                ].map(([k, v]) => (
```

Replace with (adds one new row, right before `detailDelivery` since it's
directly relevant to how delivery is fulfilled):

```tsx
              <div className="px-6 py-4 space-y-2.5 text-sm max-h-60 overflow-y-auto">
                {[
                  [t('orders.detailClient'), detail.customer_name],
                  [t('orders.detailPhone'), detail.customer_phone],
                  [t('orders.detailWilaya'), detail.wilaya],
                  [t('orders.detailCommune'), detail.commune],
                  [t('orders.detailProduct'), detail.product?.name ?? detail.landing_page?.title ?? '—'],
                  [t('orders.detailColor'), detail.color ?? '—'],
                  [t('orders.detailSize'), detail.size ?? '—'],
                  [t('orders.detailQuantity'), String(detail.quantity)],
                  [t('orders.detailDeliveryType'), detail.delivery_type === 'desk' ? t('orders.deliveryTypeDesk') : t('orders.deliveryTypeHome')],
                  [t('orders.detailDelivery'), `${Number(detail.delivery_price).toLocaleString('fr-DZ')} DA`],
                  [t('orders.detailTotal'), `${Number(detail.total_price).toLocaleString('fr-DZ')} DA`],
                  [t('orders.detailSource'), orderSourceLabel(detail.source, locale) ?? detail.source],
                ].map(([k, v]) => (
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. Also confirm `dash-info`/`dash-info-soft` and
`dash-neutral`/`dash-neutral-soft` Tailwind classes exist (they're
documented as standard semantic tokens in this project's design system —
used elsewhere for status chips, e.g. `ORDER_STATUS_DASH_COLORS`).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(platform)/dashboard/orders/page.tsx" src/lib/i18n/dictionaries/fr.ts src/lib/i18n/dictionaries/ar.ts src/lib/i18n/dictionaries/types.ts
git commit -m "feat: show delivery type on dashboard orders list and detail view"
```

---

### Task 11: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all existing tests still pass (no new tests are added by this
plan — every change here is either pure data/config, or presentational/API
wiring with no isolated pure-logic unit worth a dedicated test, matching
this codebase's existing testing pattern of testing `lib/*.ts` pure
functions and leaving route handlers / UI to manual verification).

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify pricing data correctness**

Read the final `src/lib/wilayas.ts` and spot-check at least 5 wilayas
against the corrected table in the design spec (`docs/superpowers/specs/2026-08-04-stopdesk-delivery-design.md`):
Alger, Blida, El Bayadh, Tipaza, and one deep-south wilaya (e.g.
Tamanrasset) — confirm both `DEFAULT_DELIVERY_RATES` and
`DEFAULT_DELIVERY_RATES_STOPDESK` match exactly.

- [ ] **Step 4: Manual browser walkthrough (requires migration 047 applied + a live dev/staging environment)**

1. On a store's public order form (any product), confirm the "Mode de
   livraison" toggle appears with Domicile/Stop-desk options, and that the
   displayed delivery price changes when switching between them (for a
   wilaya without a live Yalidine connection, prices should come from the
   static default/custom rates; with Yalidine connected, prices should
   update to live home/desk fees).
2. Submit a test order with Stop-desk selected. Confirm in Supabase (or the
   dashboard order detail view) that `delivery_type = 'desk'` was stored.
3. In dashboard → Settings, confirm the new "Tarifs stop-desk par wilaya"
   card appears below the existing domicile rates card, with the corrected
   defaults, and that editing + saving persists correctly on reload.
4. In dashboard → Commandes, confirm the stop-desk test order shows a
   "Stop-desk" chip in the list and detail view.
5. If a Yalidine integration is connected and configured, create a shipment
   for the stop-desk test order and confirm (via Yalidine's own dashboard,
   or the returned tracking info) that it was created as a stop-desk parcel,
   not home delivery.
