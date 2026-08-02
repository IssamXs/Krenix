# Wilaya → Commune Cascading Dropdown — Design

**Date:** 2026-08-02
**Status:** Approved by user, ready for planning

## Goal

Replace the free-text "Commune" input in the storefront order form with a dropdown that cascades from the selected wilaya, sourced from a real Algeria wilaya/commune dataset, so customers pick their commune instead of typing it (typos, inconsistent spelling, harder fraud-shield/CRM grouping today).

## Source data

User supplied `Algeria-adom-bureau.csv` (a courier's home/bureau delivery coverage export). Columns: `Country_code, Region, City, Area, Rate_or_extra, Cost, Custom_rates`. `Region` = wilaya, `City` = commune. Per user instruction, pricing columns (`Rate_or_extra`, `Cost`, `Custom_rates`) are ignored — only the wilaya→commune structure is used.

**Analysis of the CSV** (1586 lines, 1531 commune rows across 54 wilayas):
- Covers 54 of the platform's 58 canonical wilayas (`src/lib/wilayas.ts` `WILAYAS`, official 1–58 numbering). Missing: **Illizi, Bordj Badji Mokhtar, In Guezzam, Djanet** — the four deep-south wilayas, apparently outside this courier's home/bureau network.
- 3 spelling mismatches against the platform's canonical `WILAYAS` names, corrected during data generation:
  | CSV spelling | Platform canonical spelling |
  |---|---|
  | Bordj Bou Arreridj | Bordj Bou Arréridj |
  | El Meghaier | El M'Ghair |
  | El Menia | El Meniaa |
- No duplicate commune names within any wilaya.
- Commune order in the CSV is preserved as-is in the generated dataset (not re-alphabetized) — it reflects the courier's own ordering, which already looks close to official commune-code order.

## Codebase context (from research)

- `src/lib/wilayas.ts` exports the canonical 58-entry `WILAYAS` array, `wilayaId()`, and `DEFAULT_DELIVERY_RATES` — untouched by this change.
- **`src/components/store/OrderFormFields.tsx`** is the one shared, reusable order-form component used across the entire live storefront: `LandingPageRenderer`, `StandaloneProductView`, `StoreOrderModal`, and all 5 niche theme components (Beauty/Tech/Fitness/Auto/Home). It currently has a wilaya `<select>` (line 509-516) and a free-text commune `<input>` (line 519-529) sharing one `form` state object (`wilaya`, `commune` keys) and one generic `set(key)` change handler (line 192-197).
- `src/components/OrderForm.tsx` is a separate, legacy, single-route order form (only used by `/product/[id]`) with different field names and its own Supabase insert path — **out of scope**, per user decision.
- `orders.commune` (canonical schema, `src/types/database.ts`) is a required non-nullable `string`; `/api/orders` (`src/app/api/orders/route.ts`) only requires it non-empty and trims/truncates to 100 chars — no whitelist validation today, and this stays unchanged per user decision (the AI chatbot's conversational order flow writes to the same column with free-form text extracted from chat, so a strict wilaya/commune whitelist would risk rejecting legitimate chatbot orders over spelling).
- Native `<select>` is the established pattern for every wilaya picker in this codebase (no custom dropdown/combobox component exists anywhere) — the commune dropdown follows the same pattern for consistency, no new UI library.
- Out of scope, confirmed by research: Yalidine's own live per-commune fee lookup (`src/lib/yalidine.ts`, sourced from Yalidine's API, not this static dataset), the admin per-wilaya delivery-rate settings screen, the Yalidine integration config screen, and the chatbot's free-text order extraction.

## Decisions (locked)

1. **Scope**: only `OrderFormFields.tsx` gets the dropdown. Legacy `OrderForm.tsx` is untouched.
2. **Missing wilayas**: for the 4 uncovered wilayas (and any wilaya with no dataset entry), the commune field falls back to today's free-text `<input>` — nobody is blocked from ordering.
3. **Server validation**: unchanged. The dropdown is a UX improvement only; `/api/orders` keeps its existing non-empty-string check.
4. **Data ordering**: communes keep the CSV's original order per wilaya (not alphabetized).

## Data model

New file `src/lib/communes.ts`:

```ts
export const COMMUNES_BY_WILAYA: Record<string, string[]> = {
  "Adrar": ["Timekten", "Bouda", /* ... */],
  // ...54 wilaya entries, 1531 communes total
}

export function getCommunesForWilaya(wilaya: string): string[] {
  return COMMUNES_BY_WILAYA[wilaya] ?? []
}
```

No database schema change — `orders.commune` stays a plain string column; the dropdown just constrains what value the customer picks from, exactly like the existing wilaya `<select>` already does without any DB-level enum.

## UI change — `OrderFormFields.tsx`

- New `handleWilayaChange` handler (replacing the generic `set('wilaya')` on that one field): sets `form.wilaya` **and** resets `form.commune` to `''` in the same update, since a commune from the previous wilaya is very likely invalid for the new one.
- The commune field becomes conditional: if `getCommunesForWilaya(form.wilaya).length > 0`, render a `<select>` populated with those communes (same `inputStyle`/RTL/label pattern as the wilaya select). Otherwise (no wilaya chosen yet, or one of the 4 uncovered wilayas), render the existing free-text `<input>` unchanged.
- Existing commune validation (`if (!form.commune.trim())`, line 223-226) stays as-is — it already fires correctly for both the select and the input, since both write into the same `form.commune` string.

## Out of scope (explicitly, per user confirmation)

- `src/components/OrderForm.tsx` (legacy single-route form).
- Server-side whitelist validation of commune against wilaya.
- Any change to Yalidine's live commune-fee lookup, the admin delivery-rate settings screen, or the chatbot's conversational order flow.

## Testing notes

- Unit test `getCommunesForWilaya`: returns the right list for a covered wilaya, returns `[]` for an uncovered one (e.g. "Illizi") and for an unknown string.
- Manual verification in the browser: select a wilaya with data → commune becomes a populated dropdown; switch wilaya → commune resets to empty; select one of the 4 uncovered wilayas → commune reverts to free-text input; submit an order end-to-end and confirm `commune` still saves correctly either way.
