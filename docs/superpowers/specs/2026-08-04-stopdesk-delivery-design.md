# Stop-desk Delivery Option — Design Spec

## Goal
Add a stop-desk (point relais / bureau) delivery choice to the customer order
form, alongside the existing home-delivery ("domicile") option, with correct
default pricing per wilaya, and wire the customer's choice through to
automatic Yalidine shipment creation (which already supports stop-desk at the
API level but has never had a caller set it).

## Background: what's already there vs. what's missing
- `src/lib/yalidine.ts`'s `createYalidineParcel` already accepts `isStopdesk`
  and sends `is_stopdesk` to Yalidine's API — but nothing ever passes it, so
  every shipment defaults to home delivery regardless of what the customer
  wanted.
- `getYalidineFees` already returns both `home` and `desk` per-commune prices
  — but `/api/storefront/delivery-fees` (used by the order form) discards
  `desk` and only ever returns an averaged `home` fee.
- The order form (`OrderFormFields.tsx`) has no delivery-type selector at
  all; the order record has no field to store the choice.
- Only Yalidine's courier adapter has stop-desk API support today (ZR,
  Maystro, WeCan are unverified/shell integrations per prior project notes).

## Corrected default pricing
Source: WeCan Services "Tarif Économique" rate sheet (photo provided by the
merchant). Comparing it against the current `DEFAULT_DELIVERY_RATES` in
`src/lib/wilayas.ts` surfaced two existing mismatches, both corrected as part
of this change:
- **El Bayadh**: currently priced as Zone 3 (800 DA) — should be Zone 4
  (1600 DA), per the photo.
- **Tipaza**: currently priced as Zone 1 (500 DA) — should be Zone 2
  (650 DA), per the photo.

Final corrected domicile table (`DEFAULT_DELIVERY_RATES`) and new stop-desk
table (`DEFAULT_DELIVERY_RATES_STOPDESK`):

| Zone | Wilayas | Domicile | Stop-desk |
|---|---|---|---|
| 1 | Alger | 450 | 350 |
| 1 | Blida, Boumerdès | 500 | 400 |
| 2 | Tipaza, Chlef, Oum El Bouaghi, Batna, Béjaïa, Bouira, Tlemcen, Tiaret, Tizi Ouzou, Jijel, Sétif, Saïda, Skikda, Sidi Bel Abbès, Annaba, Guelma, Constantine, Médéa, Mostaganem, M'Sila, Mascara, Oran, Bordj Bou Arréridj, El Tarf, Tissemsilt, Khenchela, Souk Ahras, Mila, Aïn Defla, Aïn Témouchent, Relizane | 650 | 550 |
| 3 | Laghouat, Biskra, Tébessa, Djelfa, Ouargla, El Oued, Ghardaïa, Ouled Djellal, Touggourt, El M'Ghair, El Meniaa | 800 | 650 |
| 4/5 | Adrar, Béchar, El Bayadh, Naâma, Timimoun, Bordj Badji Mokhtar, Béni Abbès, Tamanrasset, Illizi, Tindouf, In Salah, In Guezzam, Djanet | 1600 | 1500 |

`default` fallback key: 650 (domicile, unchanged) / 550 (stop-desk).

`src/lib/delivery.ts` (`DELIVERY_FEES`/`getDeliveryFee`) and
`src/components/OrderForm.tsx` are dead code (verified: `OrderForm.tsx` is
imported nowhere) — explicitly out of scope, not touched.

## Data model
- **Additive, non-breaking.** `StoreSettings.deliveryRatesStopdesk?: { default: number; [wilaya: string]: number }`
  — new sibling field next to the existing `deliveryRates`, same shape. A
  store that hasn't set it falls back to `DEFAULT_DELIVERY_RATES_STOPDESK`,
  exactly how `deliveryRates` already falls back to `DEFAULT_DELIVERY_RATES`.
- `Order.delivery_type: 'home' | 'desk'` — new column, `NOT NULL DEFAULT
  'home'`. Every existing order is correctly interpreted as home delivery
  (the only option that existed before this change).

## Customer order form (`OrderFormFields.tsx`)
- New two-button toggle: "Domicile" / "Stop-desk" (FR) — matching this
  file's existing inline `isRTL ? ... : ...` bilingual pattern (this
  component does not use the `t()` i18n system; it has its own FR/AR
  convention throughout, which this feature follows rather than introducing
  a second pattern).
- Price calculation: when a live Yalidine fee is available (existing
  `dynamicDeliveryFee` mechanism), use its `home`/`desk` value matching the
  selected type. Otherwise fall back to the store's static
  `deliveryRates`/`deliveryRatesStopdesk` for the selected wilaya.
- The selected `delivery_type` is sent to `/api/orders` and stored on the
  order.

## Backend wiring
- `/api/storefront/delivery-fees`: now returns both `homeFee` and `deskFee`
  (averaged per-commune from Yalidine, same method already used for the
  single `fee` today), instead of just `fee`.
- `/api/orders` (POST): accepts `delivery_type` from the request body,
  validates it's `'home'` or `'desk'` (defaults to `'home'` if missing or
  invalid — never trusts an unvalidated value), stores it on the order.
- `/api/integrations/delivery/ship` (POST): reads the order's
  `delivery_type` and passes `isStopdesk: order.delivery_type === 'desk'`
  to `adapter.createParcel(...)`. `CourierParcelInput` (in
  `src/lib/couriers.ts`) gains an `isStopdesk?: boolean` field so it flows
  through to Yalidine's adapter without a type mismatch. The other three
  adapters (Maystro, ZR, Procolis/WeCan) simply ignore the field — matching
  "capture-only" scope confirmed with the merchant.

## Dashboard
- **Settings page**: a new "Stop-desk" rates card, structurally identical to
  the existing "Domicile" per-wilaya rate editor (same flat/wilaya mode
  toggle is NOT duplicated — stop-desk rates are always per-wilaya, since
  there's no flat-stop-desk concept in the source data — just the per-wilaya
  grid, "apply to all", and show-all-wilayas toggle, mirroring the existing
  component's structure and i18n usage).
- **Orders list + detail**: a small "Domicile"/"Stop-desk" chip next to the
  wilaya column (list) and as a labeled row (detail modal), so merchants
  fulfilling through non-Yalidine couriers know which option the customer
  picked and can act on it manually.

## Out of scope
- No stop-desk API wiring for Maystro, ZR Express, or Procolis/WeCan — their
  adapters don't support it yet; this is a future task if/when those
  integrations are built out for real.
- No changes to `src/lib/delivery.ts` or `src/components/OrderForm.tsx` —
  confirmed dead code, not part of the live order flow.
- No per-store toggle to disable the stop-desk option entirely — it's always
  offered, consistent with how domicile delivery is always offered today.
