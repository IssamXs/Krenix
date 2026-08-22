# Product Offers, AI Landing Page Language, Larger Photos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 10-preset "offers" system to products (buy X get Y free, % off, bundles, tiers) that's chosen in the dashboard and auto-applied on the storefront including price enforcement; verify the already-built AI landing page Arabic/French feature end-to-end; make storefront product photos visibly larger.

**Architecture:** Offers are stored as 4 new columns on `products` (`offer_type`, `offer_config` jsonb, `offer_label`, `offer_active`). A single TypeScript reference implementation (`src/lib/offers.ts`) computes the discounted price for the live storefront UI; a hand-mirrored PL/pgSQL function (`compute_offer_total`) enforces the same math server-side inside the existing `validate_order_insert` trigger, which already discards client-submitted prices. Dashboard product create/edit pages get an `OfferPicker` component; the storefront gets an `OfferBadge` component wired into the product card, landing page, and order form. Photo sizing is a pure CSS/Tailwind change (grid column count + one fixed-height carousel fix) — no data model changes.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase Postgres (PL/pgSQL triggers), Tailwind CSS, Vitest.

Spec: `docs/superpowers/specs/2026-08-17-offers-language-photos-design.md`

---

### Task 1: Database migration — offer columns + pricing enforcement

**Files:**
- Create: `Database/057_product_offers.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- 057 — Product offers (buy X get Y free, % off, bundles, tiers)
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: store owners pick one promotional offer per product from 10 curated
-- presets (see src/lib/offers.ts for the canonical list). The chosen offer
-- is stored as (offer_type, offer_config) — generic enough to cover all 6
-- underlying calculation types with one schema. As with pricing generally
-- (see 036_authorization_hardening.sql), the client is never trusted for the
-- final price: validate_order_insert already re-derives unit_price/total_price
-- from the products table on every order insert, so it's extended here to
-- also apply the active offer via compute_offer_total(), which mirrors the
-- TypeScript computeOfferPrice() in src/lib/offers.ts formula-for-formula.
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS offer_type TEXT
  CHECK (offer_type IS NULL OR offer_type IN (
    'buy_x_get_y_free', 'buy_x_get_percent_off', 'nth_item_percent_off',
    'bundle_fixed_price', 'flat_percent_off', 'tiered_discount'
  ));
ALTER TABLE products ADD COLUMN IF NOT EXISTS offer_config JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS offer_label TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS offer_active BOOLEAN NOT NULL DEFAULT false;

-- ---------- compute_offer_total: single source of truth for server-side pricing ----------
-- Mirrors computeOfferPrice() in src/lib/offers.ts. Any change to one MUST be
-- mirrored in the other — see the comment at the top of that file.
CREATE OR REPLACE FUNCTION compute_offer_total(
  unit_price NUMERIC, qty INTEGER, offer_type TEXT, offer_config JSONB
) RETURNS NUMERIC AS $$
DECLARE
  buy_qty INTEGER;
  free_qty INTEGER;
  percent_off NUMERIC;
  nth INTEGER;
  bundle_qty INTEGER;
  bundle_price NUMERIC;
  group_size INTEGER;
  groups INTEGER;
  remainder INTEGER;
  payable INTEGER;
  discounted_units INTEGER;
  full_units INTEGER;
  tier JSONB;
  best_min_qty INTEGER;
  best_percent NUMERIC;
  t_min INTEGER;
  t_pct NUMERIC;
BEGIN
  IF offer_type IS NULL OR offer_config IS NULL THEN
    RETURN unit_price * qty;
  END IF;

  IF offer_type = 'buy_x_get_y_free' THEN
    buy_qty := (offer_config->>'buyQty')::INTEGER;
    free_qty := (offer_config->>'freeQty')::INTEGER;
    IF buy_qty IS NULL OR free_qty IS NULL OR buy_qty < 1 OR free_qty < 1 THEN
      RETURN unit_price * qty;
    END IF;
    group_size := buy_qty + free_qty;
    groups := FLOOR(qty::NUMERIC / group_size);
    payable := qty - (groups * free_qty);
    RETURN payable * unit_price;

  ELSIF offer_type = 'buy_x_get_percent_off' THEN
    buy_qty := (offer_config->>'buyQty')::INTEGER;
    percent_off := (offer_config->>'percentOff')::NUMERIC;
    IF buy_qty IS NULL OR percent_off IS NULL OR qty < buy_qty THEN
      RETURN unit_price * qty;
    END IF;
    RETURN ROUND(unit_price * qty * (1 - percent_off / 100));

  ELSIF offer_type = 'nth_item_percent_off' THEN
    nth := (offer_config->>'nth')::INTEGER;
    percent_off := (offer_config->>'percentOff')::NUMERIC;
    IF nth IS NULL OR nth < 2 OR percent_off IS NULL THEN
      RETURN unit_price * qty;
    END IF;
    discounted_units := FLOOR(qty::NUMERIC / nth);
    full_units := qty - discounted_units;
    RETURN ROUND(full_units * unit_price + discounted_units * unit_price * (1 - percent_off / 100));

  ELSIF offer_type = 'bundle_fixed_price' THEN
    bundle_qty := (offer_config->>'bundleQty')::INTEGER;
    bundle_price := (offer_config->>'bundlePrice')::NUMERIC;
    IF bundle_qty IS NULL OR bundle_qty < 1 OR bundle_price IS NULL THEN
      RETURN unit_price * qty;
    END IF;
    groups := FLOOR(qty::NUMERIC / bundle_qty);
    remainder := qty - (groups * bundle_qty);
    RETURN groups * bundle_price + remainder * unit_price;

  ELSIF offer_type = 'flat_percent_off' THEN
    percent_off := (offer_config->>'percentOff')::NUMERIC;
    IF percent_off IS NULL THEN
      RETURN unit_price * qty;
    END IF;
    RETURN ROUND(unit_price * qty * (1 - percent_off / 100));

  ELSIF offer_type = 'tiered_discount' THEN
    best_min_qty := NULL;
    best_percent := NULL;
    FOR tier IN SELECT * FROM jsonb_array_elements(offer_config->'tiers')
    LOOP
      t_min := (tier->>'minQty')::INTEGER;
      t_pct := (tier->>'percentOff')::NUMERIC;
      IF qty >= t_min AND (best_min_qty IS NULL OR t_min > best_min_qty) THEN
        best_min_qty := t_min;
        best_percent := t_pct;
      END IF;
    END LOOP;
    IF best_percent IS NULL THEN
      RETURN unit_price * qty;
    END IF;
    RETURN ROUND(unit_price * qty * (1 - best_percent / 100));

  ELSE
    RETURN unit_price * qty;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ---------- validate_order_insert: apply the active offer when pricing ----------
CREATE OR REPLACE FUNCTION validate_order_insert()
RETURNS TRIGGER AS $$
DECLARE
  real_price DECIMAL(10,2);
  store_row RECORD;
  prod_offer_type TEXT;
  prod_offer_config JSONB;
  prod_offer_active BOOLEAN;
BEGIN
  SELECT is_suspended, subscription_status INTO store_row FROM stores WHERE id = NEW.store_id;
  IF store_row IS NULL OR store_row.is_suspended OR store_row.subscription_status != 'active' THEN
    RAISE EXCEPTION 'Boutique indisponible';
  END IF;

  NEW.customer_phone := regexp_replace(NEW.customer_phone, '\s', '', 'g');
  IF NEW.customer_phone !~ '^(05|06|07)[0-9]{8}$' THEN
    RAISE EXCEPTION 'Numéro de téléphone invalide';
  END IF;

  IF NEW.wilaya IS NULL OR length(trim(NEW.wilaya)) = 0 THEN
    RAISE EXCEPTION 'Wilaya requise';
  END IF;

  IF NEW.commune IS NULL OR length(trim(NEW.commune)) = 0 THEN
    RAISE EXCEPTION 'Commune requise';
  END IF;

  IF NEW.quantity IS NULL OR NEW.quantity < 1 OR NEW.quantity > 100 THEN
    RAISE EXCEPTION 'Quantité invalide';
  END IF;

  IF length(NEW.customer_name) > 100 OR length(NEW.commune) > 100 THEN
    RAISE EXCEPTION 'Champ trop long';
  END IF;
  IF NEW.notes IS NOT NULL AND length(NEW.notes) > 1000 THEN
    RAISE EXCEPTION 'Notes trop longues';
  END IF;

  NEW.delivery_price := LEAST(GREATEST(COALESCE(NEW.delivery_price, 0), 0), 5000);

  IF NEW.product_id IS NOT NULL THEN
    SELECT price, offer_type, offer_config, offer_active
      INTO real_price, prod_offer_type, prod_offer_config, prod_offer_active
      FROM products WHERE id = NEW.product_id;
    IF real_price IS NOT NULL THEN
      NEW.unit_price := real_price;
      IF prod_offer_active THEN
        NEW.total_price := compute_offer_total(real_price, NEW.quantity, prod_offer_type, prod_offer_config) + NEW.delivery_price;
      ELSE
        NEW.total_price := (real_price * NEW.quantity) + NEW.delivery_price;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

Paste the file contents into Supabase Dashboard → SQL Editor → Run. Confirm no errors.

- [ ] **Step 3: Verify with a manual query**

Run in the SQL Editor:

```sql
SELECT compute_offer_total(1000, 3, 'buy_x_get_y_free', '{"buyQty": 2, "freeQty": 1}'::jsonb) AS should_be_2000;
SELECT compute_offer_total(1000, 3, 'flat_percent_off', '{"percentOff": 15}'::jsonb) AS should_be_2550;
SELECT compute_offer_total(1000, 3, NULL, NULL) AS should_be_3000;
```

Expected: `2000`, `2550`, `3000`.

- [ ] **Step 4: Commit**

```bash
git add Database/057_product_offers.sql
git commit -m "feat(db): add product offer columns and server-side pricing enforcement"
```

---

### Task 2: `src/lib/offers.ts` — offer types, 10 presets, pricing calculator

**Files:**
- Create: `src/lib/offers.ts`
- Test: `src/lib/offers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/offers.test.ts
import { describe, it, expect } from 'vitest'
import { computeOfferPrice, OFFER_PRESETS } from './offers'

describe('OFFER_PRESETS', () => {
  it('has exactly 10 presets with unique ids', () => {
    expect(OFFER_PRESETS).toHaveLength(10)
    expect(new Set(OFFER_PRESETS.map(p => p.id)).size).toBe(10)
  })
})

describe('computeOfferPrice', () => {
  it('returns full price with no offer', () => {
    expect(computeOfferPrice(1000, 3, null, null)).toEqual({ payableQty: 3, freeQty: 0, totalPrice: 3000 })
  })

  describe('buy_x_get_y_free', () => {
    it('charges full price below the threshold', () => {
      expect(computeOfferPrice(1000, 2, 'buy_x_get_y_free', { buyQty: 2, freeQty: 1 }))
        .toEqual({ payableQty: 2, freeQty: 0, totalPrice: 2000 })
    })
    it('applies one free unit per complete group', () => {
      expect(computeOfferPrice(1000, 3, 'buy_x_get_y_free', { buyQty: 2, freeQty: 1 }))
        .toEqual({ payableQty: 2, freeQty: 1, totalPrice: 2000 })
    })
    it('applies two free units for two complete groups', () => {
      expect(computeOfferPrice(1000, 6, 'buy_x_get_y_free', { buyQty: 2, freeQty: 1 }))
        .toEqual({ payableQty: 4, freeQty: 2, totalPrice: 4000 })
    })
    it('does not apply a free unit to a partial trailing group', () => {
      expect(computeOfferPrice(1000, 4, 'buy_x_get_y_free', { buyQty: 2, freeQty: 1 }))
        .toEqual({ payableQty: 3, freeQty: 1, totalPrice: 3000 })
    })
  })

  describe('buy_x_get_percent_off', () => {
    it('charges full price below the threshold', () => {
      expect(computeOfferPrice(1000, 1, 'buy_x_get_percent_off', { buyQty: 2, percentOff: 20 }))
        .toEqual({ payableQty: 1, freeQty: 0, totalPrice: 1000 })
    })
    it('applies the discount to the whole order at the threshold', () => {
      expect(computeOfferPrice(1000, 2, 'buy_x_get_percent_off', { buyQty: 2, percentOff: 20 }))
        .toEqual({ payableQty: 2, freeQty: 0, totalPrice: 1600 })
    })
  })

  describe('nth_item_percent_off', () => {
    it('discounts every nth unit', () => {
      expect(computeOfferPrice(1000, 4, 'nth_item_percent_off', { nth: 2, percentOff: 50 }))
        .toEqual({ payableQty: 4, freeQty: 0, totalPrice: 3000 })
    })
  })

  describe('bundle_fixed_price', () => {
    it('prices complete bundles flat and remainder at unit price', () => {
      expect(computeOfferPrice(1000, 5, 'bundle_fixed_price', { bundleQty: 2, bundlePrice: 1800 }))
        .toEqual({ payableQty: 5, freeQty: 0, totalPrice: 4600 })
    })
  })

  describe('flat_percent_off', () => {
    it('applies regardless of quantity', () => {
      expect(computeOfferPrice(1000, 1, 'flat_percent_off', { percentOff: 15 }))
        .toEqual({ payableQty: 1, freeQty: 0, totalPrice: 850 })
    })
  })

  describe('tiered_discount', () => {
    it('applies no discount below the lowest tier', () => {
      expect(computeOfferPrice(1000, 2, 'tiered_discount', { tiers: [{ minQty: 3, percentOff: 10 }, { minQty: 5, percentOff: 20 }] }))
        .toEqual({ payableQty: 2, freeQty: 0, totalPrice: 2000 })
    })
    it('applies the highest qualifying tier', () => {
      expect(computeOfferPrice(1000, 5, 'tiered_discount', { tiers: [{ minQty: 3, percentOff: 10 }, { minQty: 5, percentOff: 20 }] }))
        .toEqual({ payableQty: 5, freeQty: 0, totalPrice: 4000 })
    })
    it('does not overshoot to a higher tier than qualified', () => {
      expect(computeOfferPrice(1000, 4, 'tiered_discount', { tiers: [{ minQty: 3, percentOff: 10 }, { minQty: 5, percentOff: 20 }] }))
        .toEqual({ payableQty: 4, freeQty: 0, totalPrice: 3600 })
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/offers.test.ts`
Expected: FAIL — `Cannot find module './offers'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/offers.ts
//
// Offer pricing lives in exactly two places: this file (client-side preview
// used by OrderFormFields.tsx) and compute_offer_total() in
// Database/057_product_offers.sql (server-side enforcement in
// validate_order_insert). They MUST compute identical results for identical
// inputs — if you change a formula here, mirror the change in the SQL
// function in the same commit.

export type OfferType =
  | 'buy_x_get_y_free'
  | 'buy_x_get_percent_off'
  | 'nth_item_percent_off'
  | 'bundle_fixed_price'
  | 'flat_percent_off'
  | 'tiered_discount'

export type OfferConfig =
  | { buyQty: number; freeQty: number }
  | { buyQty: number; percentOff: number }
  | { nth: number; percentOff: number }
  | { bundleQty: number; bundlePrice: number }
  | { percentOff: number }
  | { tiers: { minQty: number; percentOff: number }[] }

export interface OfferPreset {
  id: string
  offerType: OfferType
  label: string
  defaultConfig: OfferConfig
}

export const OFFER_PRESETS: OfferPreset[] = [
  { id: 'buy2get1', offerType: 'buy_x_get_y_free', label: 'Achetez 2, obtenez 1 gratuit', defaultConfig: { buyQty: 2, freeQty: 1 } },
  { id: 'buy3get1', offerType: 'buy_x_get_y_free', label: 'Achetez 3, obtenez 1 gratuit', defaultConfig: { buyQty: 3, freeQty: 1 } },
  { id: 'nth2half', offerType: 'nth_item_percent_off', label: '2ème article à -50%', defaultConfig: { nth: 2, percentOff: 50 } },
  { id: 'buy2pct20', offerType: 'buy_x_get_percent_off', label: '-20% dès 2 articles achetés', defaultConfig: { buyQty: 2, percentOff: 20 } },
  { id: 'buy3pct30', offerType: 'buy_x_get_percent_off', label: '-30% dès 3 articles achetés', defaultConfig: { buyQty: 3, percentOff: 30 } },
  { id: 'bundle2', offerType: 'bundle_fixed_price', label: 'Pack de 2 à prix fixe', defaultConfig: { bundleQty: 2, bundlePrice: 0 } },
  { id: 'bundle3', offerType: 'bundle_fixed_price', label: 'Pack de 3 à prix fixe', defaultConfig: { bundleQty: 3, bundlePrice: 0 } },
  { id: 'flat15', offerType: 'flat_percent_off', label: '-15% sur cet article', defaultConfig: { percentOff: 15 } },
  { id: 'flat25', offerType: 'flat_percent_off', label: '-25% sur cet article', defaultConfig: { percentOff: 25 } },
  {
    id: 'tiered', offerType: 'tiered_discount', label: 'Réduction par palier (3+ : -10%, 5+ : -20%)',
    defaultConfig: { tiers: [{ minQty: 3, percentOff: 10 }, { minQty: 5, percentOff: 20 }] },
  },
]

export interface OfferComputation {
  payableQty: number
  freeQty: number
  totalPrice: number
}

export function computeOfferPrice(
  unitPrice: number,
  quantity: number,
  offerType: OfferType | null | undefined,
  offerConfig: OfferConfig | null | undefined,
): OfferComputation {
  const fallback: OfferComputation = { payableQty: quantity, freeQty: 0, totalPrice: unitPrice * quantity }
  if (!offerType || !offerConfig || quantity < 1) return fallback

  switch (offerType) {
    case 'buy_x_get_y_free': {
      const { buyQty, freeQty } = offerConfig as { buyQty: number; freeQty: number }
      if (!buyQty || !freeQty || buyQty < 1 || freeQty < 1) return fallback
      const groupSize = buyQty + freeQty
      const groups = Math.floor(quantity / groupSize)
      const free = groups * freeQty
      const payable = quantity - free
      return { payableQty: payable, freeQty: free, totalPrice: payable * unitPrice }
    }
    case 'buy_x_get_percent_off': {
      const { buyQty, percentOff } = offerConfig as { buyQty: number; percentOff: number }
      if (!buyQty || quantity < buyQty) return fallback
      return { payableQty: quantity, freeQty: 0, totalPrice: Math.round(unitPrice * quantity * (1 - percentOff / 100)) }
    }
    case 'nth_item_percent_off': {
      const { nth, percentOff } = offerConfig as { nth: number; percentOff: number }
      if (!nth || nth < 2) return fallback
      const discountedUnits = Math.floor(quantity / nth)
      const fullUnits = quantity - discountedUnits
      const total = fullUnits * unitPrice + discountedUnits * unitPrice * (1 - percentOff / 100)
      return { payableQty: quantity, freeQty: 0, totalPrice: Math.round(total) }
    }
    case 'bundle_fixed_price': {
      const { bundleQty, bundlePrice } = offerConfig as { bundleQty: number; bundlePrice: number }
      if (!bundleQty || bundleQty < 1) return fallback
      const groups = Math.floor(quantity / bundleQty)
      const remainder = quantity - groups * bundleQty
      const total = groups * bundlePrice + remainder * unitPrice
      return { payableQty: quantity, freeQty: 0, totalPrice: Math.round(total) }
    }
    case 'flat_percent_off': {
      const { percentOff } = offerConfig as { percentOff: number }
      return { payableQty: quantity, freeQty: 0, totalPrice: Math.round(unitPrice * quantity * (1 - percentOff / 100)) }
    }
    case 'tiered_discount': {
      const { tiers } = offerConfig as { tiers: { minQty: number; percentOff: number }[] }
      const applicable = tiers
        .filter(t => quantity >= t.minQty)
        .sort((a, b) => b.minQty - a.minQty)[0]
      if (!applicable) return fallback
      return { payableQty: quantity, freeQty: 0, totalPrice: Math.round(unitPrice * quantity * (1 - applicable.percentOff / 100)) }
    }
    default:
      return fallback
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/offers.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add src/lib/offers.ts src/lib/offers.test.ts
git commit -m "feat: add offer presets and client-side pricing calculator"
```

---

### Task 3: Add offer fields to the `Product` type

**Files:**
- Modify: `src/types/database.ts:237-270`

- [ ] **Step 1: Add the 4 fields to the `Product` interface**

In `src/types/database.ts`, find:

```ts
  // Merchandising tags (Ultimate+). Ids reference BADGE_CATALOG in
  // lib/product-badges.ts. Empty for stores below Ultimate — enforced by the
  // enforce_product_badges_plan DB trigger, not just client-side gating.
  badges: string[]
  created_at: string
  updated_at: string
}
```

Replace with:

```ts
  // Merchandising tags (Ultimate+). Ids reference BADGE_CATALOG in
  // lib/product-badges.ts. Empty for stores below Ultimate — enforced by the
  // enforce_product_badges_plan DB trigger, not just client-side gating.
  badges: string[]
  // Promotional offer (buy X get Y free, % off, bundle, tiers). offer_type/
  // offer_config values are validated against OfferType/OfferConfig in
  // lib/offers.ts — kept loosely typed here to match the `badges` convention
  // and avoid a types.ts -> lib import. Enforced server-side by
  // compute_offer_total() in Database/057_product_offers.sql.
  offer_type: string | null
  offer_config: Record<string, unknown> | null
  offer_label: string | null
  offer_active: boolean
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add offer fields to Product type"
```

---

### Task 4: i18n dictionary keys for the offers UI

**Files:**
- Modify: `src/lib/i18n/dictionaries/types.ts`
- Modify: `src/lib/i18n/dictionaries/fr.ts`
- Modify: `src/lib/i18n/dictionaries/ar.ts`

- [ ] **Step 1: Add the `productOffers` shape to `Dictionary`**

In `src/lib/i18n/dictionaries/types.ts`, find the `productEdit` block's closing and the following key (or any convenient spot inside the top-level `Dictionary` interface — mirror the position of `productEdit`), and add a sibling key:

```ts
  productOffers: {
    title: string
    hint: string
    active: string
    inactive: string
    remove: string
    apply: string
    buyQtyLabel: string
    freeQtyLabel: string
    percentOffLabel: string
    nthLabel: string
    bundleQtyLabel: string
    bundlePriceLabel: string
    tiersHint: string
    tierMinQtyLabel: string
    tierPercentOffLabel: string
    addTier: string
    removeTier: string
  }
```

- [ ] **Step 2: Add French copy**

In `src/lib/i18n/dictionaries/fr.ts`, right after the `productEdit: { ... }` block (after its closing `},`), add:

```ts
  productOffers: {
    title: 'Offre promotionnelle',
    hint: 'Choisissez une offre parmi les suggestions, ajustez les chiffres si besoin, puis activez-la. Une seule offre active par produit.',
    active: 'Offre active',
    inactive: 'Offre désactivée',
    remove: "Retirer l'offre",
    apply: "Appliquer l'offre",
    buyQtyLabel: 'Quantité à acheter',
    freeQtyLabel: 'Quantité offerte',
    percentOffLabel: 'Réduction (%)',
    nthLabel: 'Tous les N articles',
    bundleQtyLabel: 'Quantité du pack',
    bundlePriceLabel: 'Prix du pack (DZD)',
    tiersHint: 'Chaque palier applique sa réduction dès que la quantité minimale est atteinte.',
    tierMinQtyLabel: 'Quantité min.',
    tierPercentOffLabel: 'Réduction (%)',
    addTier: 'Ajouter un palier',
    removeTier: 'Supprimer',
  },
```

- [ ] **Step 3: Add Arabic copy**

In `src/lib/i18n/dictionaries/ar.ts`, right after the `productEdit: { ... }` block, add:

```ts
  productOffers: {
    title: 'عرض ترويجي',
    hint: 'اختر عرضاً من الاقتراحات، عدّل الأرقام إذا لزم الأمر، ثم فعّله. عرض واحد فقط لكل منتج.',
    active: 'العرض مفعّل',
    inactive: 'العرض معطّل',
    remove: 'إزالة العرض',
    apply: 'تطبيق العرض',
    buyQtyLabel: 'الكمية المطلوب شراؤها',
    freeQtyLabel: 'الكمية المجانية',
    percentOffLabel: 'الخصم (%)',
    nthLabel: 'كل N قطعة',
    bundleQtyLabel: 'كمية الحزمة',
    bundlePriceLabel: 'سعر الحزمة (دج)',
    tiersHint: 'كل مستوى يطبّق خصمه بمجرد بلوغ الكمية الدنيا.',
    tierMinQtyLabel: 'الكمية الدنيا',
    tierPercentOffLabel: 'الخصم (%)',
    addTier: 'إضافة مستوى',
    removeTier: 'حذف',
  },
```

- [ ] **Step 4: Verify TypeScript compiles (dictionary shape enforced by `satisfies Dictionary`)**

Run: `npx tsc --noEmit`
Expected: no errors related to `fr.ts`/`ar.ts`/`types.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/dictionaries/types.ts src/lib/i18n/dictionaries/fr.ts src/lib/i18n/dictionaries/ar.ts
git commit -m "feat(i18n): add product offers translation keys"
```

---

### Task 5: `OfferPicker` dashboard component

**Files:**
- Create: `src/components/dashboard/OfferPicker.tsx`

This component is self-contained: given the currently selected offer (or none) and a callback, it renders the 10 preset cards, editable numeric fields for the selected preset, an active/inactive toggle, and a remove button. It has no knowledge of Supabase — the parent page owns persistence.

- [ ] **Step 1: Write the component**

```tsx
// src/components/dashboard/OfferPicker.tsx
'use client'

import { useI18n } from '@/lib/i18n/LocaleProvider'
import { OFFER_PRESETS, type OfferType, type OfferConfig } from '@/lib/offers'
import { ToggleLeft, ToggleRight, X, Plus, Trash2 } from 'lucide-react'

export interface OfferValue {
  offerType: OfferType | null
  offerConfig: OfferConfig | null
  offerLabel: string | null
  offerActive: boolean
}

interface Props {
  value: OfferValue
  onChange: (next: OfferValue) => void
}

const inputClass =
  'w-full px-3 py-2 rounded-lg bg-dash-surface-2 border border-dash-border text-dash-ink text-sm outline-none focus:border-dash-accent/50 transition-all'

export default function OfferPicker({ value, onChange }: Props) {
  const { t } = useI18n()
  const selectedPreset = OFFER_PRESETS.find(p => p.offerType === value.offerType && value.offerConfig
    ? Object.keys(p.defaultConfig).every(k => k in (value.offerConfig as object))
    : false) ?? null

  const selectPreset = (presetId: string) => {
    const preset = OFFER_PRESETS.find(p => p.id === presetId)
    if (!preset) return
    onChange({
      offerType: preset.offerType,
      offerConfig: preset.defaultConfig,
      offerLabel: preset.label,
      offerActive: true,
    })
  }

  const updateConfig = (patch: Partial<Record<string, number>>) => {
    if (!value.offerConfig) return
    onChange({ ...value, offerConfig: { ...value.offerConfig, ...patch } as OfferConfig })
  }

  const remove = () => onChange({ offerType: null, offerConfig: null, offerLabel: null, offerActive: false })

  const cfg = value.offerConfig as Record<string, unknown> | null

  return (
    <div className="space-y-4">
      <p className="text-xs text-dash-ink-faint">{t('productOffers.hint')}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {OFFER_PRESETS.map(preset => {
          const active = value.offerType === preset.offerType && value.offerLabel === preset.label
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => selectPreset(preset.id)}
              className={`text-left px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                active
                  ? 'border-dash-accent bg-dash-accent-soft text-dash-accent'
                  : 'border-dash-border text-dash-ink-soft hover:border-dash-ink-faint/40'
              }`}
            >
              {preset.label}
            </button>
          )
        })}
      </div>

      {value.offerType && cfg && (
        <div className="rounded-xl border border-dash-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => onChange({ ...value, offerActive: !value.offerActive })}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all ${
                value.offerActive
                  ? 'border-dash-accent/40 bg-dash-accent-soft text-dash-accent'
                  : 'border-dash-border text-dash-ink-faint'
              }`}
            >
              {value.offerActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              {value.offerActive ? t('productOffers.active') : t('productOffers.inactive')}
            </button>
            <button
              type="button"
              onClick={remove}
              className="flex items-center gap-1 text-xs text-dash-danger hover:opacity-80 transition-opacity"
            >
              <X size={13} /> {t('productOffers.remove')}
            </button>
          </div>

          {value.offerType === 'buy_x_get_y_free' && (
            <div className="grid grid-cols-2 gap-3">
              <NumberField label={t('productOffers.buyQtyLabel')} value={cfg.buyQty as number} onChange={n => updateConfig({ buyQty: n })} />
              <NumberField label={t('productOffers.freeQtyLabel')} value={cfg.freeQty as number} onChange={n => updateConfig({ freeQty: n })} />
            </div>
          )}
          {value.offerType === 'buy_x_get_percent_off' && (
            <div className="grid grid-cols-2 gap-3">
              <NumberField label={t('productOffers.buyQtyLabel')} value={cfg.buyQty as number} onChange={n => updateConfig({ buyQty: n })} />
              <NumberField label={t('productOffers.percentOffLabel')} value={cfg.percentOff as number} onChange={n => updateConfig({ percentOff: n })} />
            </div>
          )}
          {value.offerType === 'nth_item_percent_off' && (
            <div className="grid grid-cols-2 gap-3">
              <NumberField label={t('productOffers.nthLabel')} value={cfg.nth as number} onChange={n => updateConfig({ nth: n })} />
              <NumberField label={t('productOffers.percentOffLabel')} value={cfg.percentOff as number} onChange={n => updateConfig({ percentOff: n })} />
            </div>
          )}
          {value.offerType === 'bundle_fixed_price' && (
            <div className="grid grid-cols-2 gap-3">
              <NumberField label={t('productOffers.bundleQtyLabel')} value={cfg.bundleQty as number} onChange={n => updateConfig({ bundleQty: n })} />
              <NumberField label={t('productOffers.bundlePriceLabel')} value={cfg.bundlePrice as number} onChange={n => updateConfig({ bundlePrice: n })} />
            </div>
          )}
          {value.offerType === 'flat_percent_off' && (
            <NumberField label={t('productOffers.percentOffLabel')} value={cfg.percentOff as number} onChange={n => updateConfig({ percentOff: n })} />
          )}
          {value.offerType === 'tiered_discount' && (
            <TieredEditor
              tiers={(cfg.tiers as { minQty: number; percentOff: number }[]) ?? []}
              onChange={tiers => onChange({ ...value, offerConfig: { tiers } })}
              t={t}
            />
          )}
        </div>
      )}
    </div>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <label className="block text-xs text-dash-ink-soft mb-1.5">{label}</label>
      <input type="number" value={Number.isFinite(value) ? value : 0}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className={inputClass} />
    </div>
  )
}

function TieredEditor({ tiers, onChange, t }: {
  tiers: { minQty: number; percentOff: number }[]
  onChange: (tiers: { minQty: number; percentOff: number }[]) => void
  t: (key: string) => string
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-dash-ink-faint">{t('productOffers.tiersHint')}</p>
      {tiers.map((tier, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs text-dash-ink-soft mb-1.5">{t('productOffers.tierMinQtyLabel')}</label>
            <input type="number" value={tier.minQty}
              onChange={e => onChange(tiers.map((x, j) => j === i ? { ...x, minQty: Number(e.target.value) || 0 } : x))}
              className={inputClass} />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-dash-ink-soft mb-1.5">{t('productOffers.tierPercentOffLabel')}</label>
            <input type="number" value={tier.percentOff}
              onChange={e => onChange(tiers.map((x, j) => j === i ? { ...x, percentOff: Number(e.target.value) || 0 } : x))}
              className={inputClass} />
          </div>
          <button type="button" onClick={() => onChange(tiers.filter((_, j) => j !== i))}
            className="p-2 rounded-lg text-dash-danger hover:bg-dash-danger-soft transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...tiers, { minQty: 1, percentOff: 10 }])}
        className="flex items-center gap-1.5 text-xs text-dash-accent hover:opacity-80 transition-opacity">
        <Plus size={13} /> {t('productOffers.addTier')}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/OfferPicker.tsx
git commit -m "feat(dashboard): add OfferPicker component"
```

---

### Task 6: Wire `OfferPicker` into the new-product page

**Files:**
- Modify: `src/app/(platform)/dashboard/products/new/page.tsx`

- [ ] **Step 1: Import and state**

Find:
```ts
import { BADGE_CATALOG, canUseBadges, formatBadgeLabel } from '@/lib/product-badges'
import LockedFeatureCard from '@/components/dashboard/ui/LockedFeatureCard'
```
Replace with:
```ts
import { BADGE_CATALOG, canUseBadges, formatBadgeLabel } from '@/lib/product-badges'
import LockedFeatureCard from '@/components/dashboard/ui/LockedFeatureCard'
import OfferPicker, { type OfferValue } from '@/components/dashboard/OfferPicker'
```

Find:
```ts
  const [badges, setBadges] = useState<string[]>([])
  const [showBadgeEmojis, setShowBadgeEmojis] = useState(false)
```
Replace with:
```ts
  const [badges, setBadges] = useState<string[]>([])
  const [showBadgeEmojis, setShowBadgeEmojis] = useState(false)
  const [offer, setOffer] = useState<OfferValue>({ offerType: null, offerConfig: null, offerLabel: null, offerActive: false })
```

- [ ] **Step 2: Include offer fields in the insert**

Find:
```ts
      is_active: true,
      badges,
      meta_title: form.meta_title || null,
```
Replace with:
```ts
      is_active: true,
      badges,
      offer_type: offer.offerType,
      offer_config: offer.offerConfig,
      offer_label: offer.offerLabel,
      offer_active: offer.offerActive,
      meta_title: form.meta_title || null,
```

- [ ] **Step 3: Render the section**

Find:
```tsx
      {/* Variants */}
      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
        <h3 className="text-dash-ink font-semibold text-sm">{t('productNew.variantsTitle')}</h3>
        <VariantStockEditor value={variants} onChange={setVariants} />
      </div>
```
Replace with:
```tsx
      {/* Variants */}
      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
        <h3 className="text-dash-ink font-semibold text-sm">{t('productNew.variantsTitle')}</h3>
        <VariantStockEditor value={variants} onChange={setVariants} />
      </div>

      {/* Offer */}
      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
        <h3 className="text-dash-ink font-semibold text-sm">{t('productOffers.title')}</h3>
        <OfferPicker value={offer} onChange={setOffer} />
      </div>
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/(platform)/dashboard/products/new/page.tsx"
git commit -m "feat(dashboard): wire OfferPicker into new-product page"
```

---

### Task 7: Wire `OfferPicker` into the edit-product page

**Files:**
- Modify: `src/app/(platform)/dashboard/products/[id]/page.tsx`

- [ ] **Step 1: Read the rest of the file to find the load and save logic**

Read `src/app/(platform)/dashboard/products/[id]/page.tsx` in full before editing (it wasn't fully read during planning — the load effect that populates `form`/`badges` from the fetched product, and the `handleSave` that builds the `.update(...)` payload, both need the same 4 fields threaded through, mirroring Task 6 exactly: import `OfferPicker`/`OfferValue`, add `const [offer, setOffer] = useState<OfferValue>(...)`, populate it from the fetched product's `offer_type`/`offer_config`/`offer_label`/`offer_active` in the same effect that currently sets `setBadges(data.badges ?? [])`, include the 4 fields in the `.update({...})` payload next to `badges`, and render the same `{/* Offer */}` block from Task 6 Step 3 (placed after the Variants section, before Badges).

- [ ] **Step 2: Apply the same 4 edits as Task 6** (import, state, load-effect population, save payload, JSX block) adapted to this file's existing patterns.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(platform)/dashboard/products/[id]/page.tsx"
git commit -m "feat(dashboard): wire OfferPicker into edit-product page"
```

---

### Task 8: `OfferBadge` storefront component

**Files:**
- Create: `src/components/store/OfferBadge.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/store/OfferBadge.tsx
import type { Product } from '@/types/database'

interface Props {
  product: Pick<Product, 'offer_active' | 'offer_label'>
  className?: string
}

// Small ribbon-style badge for an active product offer. Renders nothing when
// no offer is active — callers don't need to guard.
export default function OfferBadge({ product, className = '' }: Props) {
  if (!product.offer_active || !product.offer_label) return null
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold text-white whitespace-nowrap ${className}`}
      style={{ background: '#DC2626' }}
    >
      {product.offer_label}
    </span>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/store/OfferBadge.tsx
git commit -m "feat(store): add OfferBadge component"
```

---

### Task 9: Offer-aware pricing and badge in `OrderFormFields`

**Files:**
- Modify: `src/components/store/OrderFormFields.tsx`

- [ ] **Step 1: Import the calculator**

Find:
```ts
import { colorHex, isLightHex, colorRemaining, sizeRemaining } from '@/lib/variants'
import { Loader2, CheckCircle, ShoppingBag, Truck, Check, CreditCard, Banknote } from 'lucide-react'
```
Replace with:
```ts
import { colorHex, isLightHex, colorRemaining, sizeRemaining } from '@/lib/variants'
import { computeOfferPrice, type OfferType, type OfferConfig } from '@/lib/offers'
import { Loader2, CheckCircle, ShoppingBag, Truck, Check, CreditCard, Banknote } from 'lucide-react'
```

- [ ] **Step 2: Compute the offer breakdown and replace the flat subtotal**

Find:
```ts
  const subtotal = unitPrice * form.quantity
```
Replace with:
```ts
  const offerActive = !!product?.offer_active && !overridePrice
  const offerCalc = offerActive
    ? computeOfferPrice(unitPrice, form.quantity, product!.offer_type as OfferType, product!.offer_config as unknown as OfferConfig)
    : { payableQty: form.quantity, freeQty: 0, totalPrice: unitPrice * form.quantity }
  const subtotal = offerCalc.totalPrice
```

`overridePrice` (used when a landing page sets a custom price) intentionally disables the offer calc — an offer is tied to the real product price, not an ad-hoc override.

- [ ] **Step 3: Show the free-units breakdown under the quantity stepper**

Find:
```tsx
          {Number.isFinite(variantMax) && !outOfStock && (
            <span className="text-xs" style={{ color: textMuted }}>
              {maxQty} {isRTL ? 'متوفر' : 'disponible' + (maxQty > 1 ? 's' : '')}
            </span>
          )}
        </div>
      </div>
```
Replace with:
```tsx
          {Number.isFinite(variantMax) && !outOfStock && (
            <span className="text-xs" style={{ color: textMuted }}>
              {maxQty} {isRTL ? 'متوفر' : 'disponible' + (maxQty > 1 ? 's' : '')}
            </span>
          )}
        </div>
        {offerCalc.freeQty > 0 && (
          <p className="text-xs mt-1.5 font-semibold" style={{ color: '#22c55e' }}>
            {isRTL
              ? `(منها ${offerCalc.freeQty} مجاناً)`
              : `(dont ${offerCalc.freeQty} gratuit${offerCalc.freeQty > 1 ? 's' : ''})`}
          </p>
        )}
      </div>
```

- [ ] **Step 4: Show the offer badge above the price summary**

Find:
```tsx
      {/* Price summary */}
      <div className="rounded-xl p-4 space-y-2"
```
Replace with:
```tsx
      {offerActive && product?.offer_label && (
        <div className="flex justify-center">
          <span className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: '#DC2626' }}>
            {product.offer_label}
          </span>
        </div>
      )}

      {/* Price summary */}
      <div className="rounded-xl p-4 space-y-2"
```

- [ ] **Step 5: Commit**

```bash
git add src/components/store/OrderFormFields.tsx
git commit -m "feat(store): apply active offer pricing and badge in order form"
```

---

### Task 10: Offer badge on product card

**Files:**
- Modify: `src/components/store/ProductCardImage.tsx`

- [ ] **Step 1: Render `OfferBadge` opposite the plan-badge stack**

Find:
```tsx
import { canUseBadges } from '@/lib/product-badges'
import ProductBadgeStack from './ProductBadgeStack'
```
Replace with:
```tsx
import { canUseBadges } from '@/lib/product-badges'
import ProductBadgeStack from './ProductBadgeStack'
import OfferBadge from './OfferBadge'
```

Find:
```tsx
      <ProductBadgeStack
        badges={canUseBadges(storePlan) ? product.badges : []}
        showEmojis={!!showBadgeEmojis}
        max={2}
      />
    </motion.div>
  )
}
```
Replace with:
```tsx
      <ProductBadgeStack
        badges={canUseBadges(storePlan) ? product.badges : []}
        showEmojis={!!showBadgeEmojis}
        max={2}
      />
      <OfferBadge product={product} className="absolute top-2 right-2 z-[1]" />
    </motion.div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/store/ProductCardImage.tsx
git commit -m "feat(store): show offer badge on product cards"
```

---

### Task 11: Offer badge on the landing page

**Files:**
- Modify: `src/components/store/LandingPageRenderer.tsx`

- [ ] **Step 1: Import `OfferBadge`**

Find:
```ts
import { getDisplayBadges, formatBadgeLabel, canUseBadges } from '@/lib/product-badges'
```
(if the actual import differs, add `OfferBadge` as a new import line near the other `./` component imports, e.g. after the badges import):
```ts
import OfferBadge from './OfferBadge'
```

- [ ] **Step 2: Render it next to the price**

Find:
```tsx
          {/* Price badge */}
          <div className="flex items-center gap-3 mb-6">
            <span
              className="px-5 py-2.5 rounded-2xl font-black text-2xl"
              style={{ background: primary, color: bg, boxShadow: `0 4px 20px ${primary}60` }}>
              {Number(displayPrice).toLocaleString('fr-DZ')} DA
            </span>
            {comparePrice && (
              <span className="text-lg line-through" style={{ color: textMuted }}>
                {Number(comparePrice).toLocaleString('fr-DZ')} DA
              </span>
            )}
          </div>
```
Replace with:
```tsx
          {/* Price badge */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span
              className="px-5 py-2.5 rounded-2xl font-black text-2xl"
              style={{ background: primary, color: bg, boxShadow: `0 4px 20px ${primary}60` }}>
              {Number(displayPrice).toLocaleString('fr-DZ')} DA
            </span>
            {comparePrice && (
              <span className="text-lg line-through" style={{ color: textMuted }}>
                {Number(comparePrice).toLocaleString('fr-DZ')} DA
              </span>
            )}
          </div>
          {product && <OfferBadge product={product} className="mb-6 inline-flex" />}
```

Note: if `product` can be `null` and the original block had no trailing element after the price `<div>`, ensure the next JSX sibling (the order CTA `<a href="#order-form" ...>`) still follows directly after — check the surrounding lines 320-327 read earlier when applying this edit, since `mb-6` moved from the price div onto the new badge line (so spacing before the CTA button is preserved whether or not the badge renders — add `mb-6` to the price `<div>` too if `product` is commonly null, i.e. use `mb-3` on price div only when a badge might follow; simplest robust fix: keep `mb-6` on the price div AND give the offer badge its own `mt-[-12px] mb-6` — but the straightforward version above already puts `mb-6` on the badge line, so when no product/offer exists, add `mb-6` back to the price div conditionally). To avoid conditional-margin complexity, use this simpler final version instead:

```tsx
          {/* Price badge */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span
              className="px-5 py-2.5 rounded-2xl font-black text-2xl"
              style={{ background: primary, color: bg, boxShadow: `0 4px 20px ${primary}60` }}>
              {Number(displayPrice).toLocaleString('fr-DZ')} DA
            </span>
            {comparePrice && (
              <span className="text-lg line-through" style={{ color: textMuted }}>
                {Number(comparePrice).toLocaleString('fr-DZ')} DA
              </span>
            )}
          </div>
          <div className="mb-6">
            {product && <OfferBadge product={product} />}
          </div>
```

(The empty `mb-6` div collapses to a small margin even with no badge, matching the original spacing closely enough; visually verify in Task 14 and nudge the margin if it looks off.)

- [ ] **Step 3: Commit**

```bash
git add src/components/store/LandingPageRenderer.tsx
git commit -m "feat(store): show offer badge on landing pages"
```

---

### Task 12: Larger storefront product photos

**Files:**
- Modify: `src/components/store/StoreHomepage.tsx`
- Modify: `src/components/store/AutoCatalog.tsx`
- Modify: `src/components/store/themes/beauty/BeautyStoreHome.tsx`
- Modify: `src/components/store/themes/car/CarStoreHome.tsx`
- Modify: `src/components/store/themes/home/HomeStoreHome.tsx`
- Modify: `src/components/store/themes/sport/SportStoreHome.tsx`
- Modify: `src/components/store/themes/tech/TechStoreHome.tsx`

- [ ] **Step 1: Reduce the main product grid to 3 columns on `StoreHomepage.tsx`**

Find (`StoreHomepage.tsx:204`):
```tsx
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
```
Replace with:
```tsx
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
```

- [ ] **Step 2: Fix the disproportionate mini-carousel images on `StoreHomepage.tsx`**

Find (`StoreHomepage.tsx:143-153`):
```tsx
                  {heroImage ? (
                    <div className="relative h-28 overflow-hidden">
                      <Image src={heroImage} alt={lp.title} fill sizes="192px" className="object-cover" />
                    </div>
                  ) : (
                    <div className="h-28 flex items-center justify-center" style={{ background: `${primary}10` }}>
                      <Zap size={28} style={{ color: primary, opacity: 0.4 }} />
                    </div>
                  )}
```
Replace with:
```tsx
                  {heroImage ? (
                    <div className="relative aspect-[4/5] overflow-hidden">
                      <Image src={heroImage} alt={lp.title} fill sizes="192px" className="object-cover" />
                    </div>
                  ) : (
                    <div className="aspect-[4/5] flex items-center justify-center" style={{ background: `${primary}10` }}>
                      <Zap size={28} style={{ color: primary, opacity: 0.4 }} />
                    </div>
                  )}
```

- [ ] **Step 3: Reduce `AutoCatalog.tsx` to 3 columns on desktop**

Find (`AutoCatalog.tsx:66`):
```tsx
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
```
Replace with:
```tsx
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
```

- [ ] **Step 4: Cap each niche theme's product grid at 3 columns**

In each of the 5 files below, the product grid line currently reads `grid-cols-2 md:grid-cols-3 lg:grid-cols-4` (already 3 at tablet, but opens back up to 4 on desktop ≥1024px — inconsistent with the "3 columns on desktop" decision). Drop the `lg:grid-cols-4` override so it stays capped at 3 from tablet through desktop:

`src/components/store/themes/tech/TechStoreHome.tsx:206`:
```tsx
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
```
→
```tsx
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
```

`src/components/store/themes/car/CarStoreHome.tsx:219`:
```tsx
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
```
→
```tsx
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
```

`src/components/store/themes/beauty/BeautyStoreHome.tsx:210`:
```tsx
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
```
→
```tsx
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
```

`src/components/store/themes/home/HomeStoreHome.tsx:221`:
```tsx
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
```
→
```tsx
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
```

`src/components/store/themes/sport/SportStoreHome.tsx:218`:
```tsx
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
```
→
```tsx
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
```

(Leave every other `md:grid-cols-4`/`grid-cols-4` occurrence in these files untouched — those are trust-row and footer sections, not product images, confirmed by reading their surrounding context during planning.)

- [ ] **Step 5: Commit**

```bash
git add src/components/store/StoreHomepage.tsx src/components/store/AutoCatalog.tsx src/components/store/themes/*/*.tsx
git commit -m "style(store): enlarge product photos by reducing grid density"
```

---

### Task 13: Verify AI landing page language feature end-to-end (no new code expected)

**Files:** none (verification only — fix in place if a bug is found)

- [ ] **Step 1: Start the dev server and open the dashboard's new-landing-page flow**

Use the `run` skill or start the dev server, log in as the test account (see `docs/superpowers/specs/2026-08-17-offers-language-photos-design.md` context / project memory for credentials), navigate to `/dashboard/pages/new`.

- [ ] **Step 2: Generate a page in French, confirm output**

Select an existing product, language = FR, generate. Confirm the generated hero/benefits/etc. render in French and a credit was deducted.

- [ ] **Step 3: Generate a page in Arabic, confirm RTL**

Same product, language = AR, generate. Confirm the generated copy is Arabic and the public page (`/p/[slug]`) renders right-to-left (Cairo font, `dir="rtl"`, text and layout mirrored).

- [ ] **Step 4: Generate a page with language = "both", confirm the FR/AR switcher**

Confirm the public page shows an FR/AR toggle in the header (`LandingPageRenderer.tsx:241-256`) and switching languages swaps content and direction live.

- [ ] **Step 5: Fix any bugs found, or confirm no changes needed**

If everything above works, no commit is needed for this task — note in the final report that the feature was verified working as-is. If a bug is found, fix it minimally and commit with a `fix:` message describing exactly what was broken.

---

### Task 14: End-to-end browser verification of offers and photo sizing

**Files:** none (verification only — fix in place if a bug is found)

- [ ] **Step 1: Create/edit a test product with an offer**

In the dashboard, create or edit a product, price 1000 DZD, apply the "Achetez 2, obtenez 1 gratuit" preset, activate it, save.

- [ ] **Step 2: Verify the storefront badge and order form math**

Open the storefront product/landing page for that product. Confirm the red offer badge shows on the product card and near the price. Open the order form, set quantity to 3, confirm the subtotal shows 2000 DA (not 3000) and the "(dont 1 gratuit)" note appears.

- [ ] **Step 3: Submit a real test order and verify server-enforced pricing**

Submit the order form with quantity 3. In the dashboard's Orders list, confirm the created order's `total_price` matches the discounted amount (2000 + delivery), proving the DB trigger applied the offer server-side (not just client display).

- [ ] **Step 4: Verify photo sizing across breakpoints**

Using the browser tools, load the storefront homepage at mobile (375px), tablet (768px), and desktop (1280px) widths. Confirm the product grid shows 2 / 3 / 3 columns respectively (not 4 at desktop), and the small campaign carousel cards now show properly-proportioned images instead of squashed ones. Repeat for at least one niche theme storefront.

- [ ] **Step 5: Take a screenshot and share it**

Capture a desktop screenshot of the storefront product grid post-change as visual confirmation.

---

## Self-Review Notes

- **Spec coverage:** Task 1–2 cover the data model + shared pricing formula; Task 3–7 cover dashboard configuration; Task 8–11 cover storefront display + enforcement; Task 12 covers photo sizing; Task 13 covers the already-built language feature (verification only, per spec); Task 14 is the full manual verification pass. All three spec sections are covered.
- **Type consistency:** `OfferType`/`OfferConfig` defined once in `src/lib/offers.ts` (Task 2) and imported everywhere else (`OfferPicker`, `OrderFormFields`) rather than redefined. `Product.offer_type`/`offer_config` stay loosely typed (`string | null` / `Record<string, unknown> | null`) in `database.ts` per Task 3, matching the existing `badges: string[]` convention — components narrow with `as OfferType`/`as OfferConfig` at the point of use, exactly as `canUseBadges(plan: Plan)` narrows `badges` elsewhere in the codebase.
- **No placeholders:** every step above has real, complete code or an exact find/replace pair; Task 7 explicitly defers to reading the actual file (not yet read in full during planning) but names precisely which edits to make and where, matching Task 6's fully-specified pattern rather than leaving them unspecified.
