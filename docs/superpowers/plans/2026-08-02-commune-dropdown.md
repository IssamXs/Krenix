# Wilaya to Commune Cascading Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text commune input in the shared storefront order form with a dropdown that cascades from the selected wilaya, sourced from the user-supplied courier coverage CSV, falling back to free text for the 4 wilayas the CSV doesn't cover.

**Architecture:** One new static data module (`src/lib/communes.ts`, generated once from the CSV via a throwaway Node script — not committed, matching how `src/lib/wilayas.ts` is a hand-authored static literal) plus a small helper function, both unit tested. One UI change to the single shared order-form component (`OrderFormFields.tsx`).

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-02-commune-dropdown-design.md`

---

### Task 1: Generate `src/lib/communes.ts` from the CSV

**Files:**
- Create (temporary, not committed): `<scratchpad>/generate-communes.js`
- Create: `src/lib/communes.ts`
- Test: `src/lib/communes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/communes.test.ts
import { describe, it, expect } from 'vitest'
import { COMMUNES_BY_WILAYA, getCommunesForWilaya } from './communes'

describe('COMMUNES_BY_WILAYA', () => {
  it('covers 54 wilayas', () => {
    expect(Object.keys(COMMUNES_BY_WILAYA).length).toBe(54)
  })

  it('uses the platform canonical spelling for corrected wilaya names', () => {
    expect(COMMUNES_BY_WILAYA['Bordj Bou Arréridj']).toBeDefined()
    expect(COMMUNES_BY_WILAYA["El M'Ghair"]).toBeDefined()
    expect(COMMUNES_BY_WILAYA['El Meniaa']).toBeDefined()
    expect(COMMUNES_BY_WILAYA['Bordj Bou Arreridj']).toBeUndefined()
    expect(COMMUNES_BY_WILAYA['El Meghaier']).toBeUndefined()
    expect(COMMUNES_BY_WILAYA['El Menia']).toBeUndefined()
  })

  it('has no duplicate commune names within a wilaya', () => {
    for (const [wilaya, communes] of Object.entries(COMMUNES_BY_WILAYA)) {
      expect(new Set(communes).size, `${wilaya} has a duplicate commune`).toBe(communes.length)
    }
  })

  it('matches known counts from the source CSV', () => {
    expect(COMMUNES_BY_WILAYA['Adrar'].length).toBe(16)
    expect(COMMUNES_BY_WILAYA['Adrar'][0]).toBe('Timekten')
    expect(COMMUNES_BY_WILAYA['Bordj Bou Arréridj'].length).toBe(34)
  })
})

describe('getCommunesForWilaya', () => {
  it('returns the list for a covered wilaya', () => {
    expect(getCommunesForWilaya('Adrar').length).toBe(16)
  })

  it('returns an empty array for a wilaya not covered by the source data', () => {
    expect(getCommunesForWilaya('Illizi')).toEqual([])
    expect(getCommunesForWilaya('Bordj Badji Mokhtar')).toEqual([])
    expect(getCommunesForWilaya('In Guezzam')).toEqual([])
    expect(getCommunesForWilaya('Djanet')).toEqual([])
  })

  it('returns an empty array for an unknown string', () => {
    expect(getCommunesForWilaya('')).toEqual([])
    expect(getCommunesForWilaya('Not A Wilaya')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/communes.test.ts`
Expected: FAIL — `Cannot find module './communes'`

- [ ] **Step 3: Write the generation script**

Write this to a temp file in the scratchpad directory (e.g. `generate-communes.js`) — it is a one-time build tool, not part of the app, and is deleted after use:

```js
const fs = require('fs')

const CSV_PATH = 'C:/Users/pC/Downloads/Algeria-adom-bureau.csv'
const OUT_PATH = 'src/lib/communes.ts' // run from the repo root

const NAME_FIXES = {
  'Bordj Bou Arreridj': 'Bordj Bou Arréridj',
  'El Meghaier': "El M'Ghair",
  'El Menia': 'El Meniaa',
}

const raw = fs.readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, '')
const lines = raw.split(/\r?\n/).filter(l => l.trim().length)

const byWilaya = {}
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',')
  let region = (cols[1] || '').trim()
  const city = (cols[2] || '').trim()
  if (!city) continue // skip the wilaya-level pricing-only row
  region = NAME_FIXES[region] || region
  if (!byWilaya[region]) byWilaya[region] = []
  byWilaya[region].push(city)
}

const wilayaNames = Object.keys(byWilaya).sort((a, b) => a.localeCompare(b, 'fr'))

let out = `// Generated from a courier's home/bureau delivery coverage export (Algeria-adom-bureau.csv).
// Covers 54 of the platform's 58 wilayas — see src/lib/wilayas.ts for the canonical
// 58-wilaya list. Missing: Illizi, Bordj Badji Mokhtar, In Guezzam, Djanet (not present
// in the source data). getCommunesForWilaya() returns [] for those; callers fall back
// to a free-text commune input.

export const COMMUNES_BY_WILAYA: Record<string, string[]> = {
`
for (const w of wilayaNames) {
  const communes = byWilaya[w].map(c => JSON.stringify(c)).join(', ')
  out += `  ${JSON.stringify(w)}: [${communes}],\n`
}
out += `}

export function getCommunesForWilaya(wilaya: string): string[] {
  return COMMUNES_BY_WILAYA[wilaya] ?? []
}
`

fs.writeFileSync(OUT_PATH, out, 'utf8')
console.log('wrote', OUT_PATH, '—', wilayaNames.length, 'wilayas')
```

- [ ] **Step 4: Run the generation script from the repo root**

Run: `node <path-to-scratchpad>/generate-communes.js`
Expected output: `wrote src/lib/communes.ts — 54 wilayas`

- [ ] **Step 5: Delete the temporary generation script**

It produced a static file that's now committed directly; it has no further use and isn't part of the app.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/communes.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (pre-existing unrelated errors in `crm/page.tsx` and `leads/page.tsx` from other in-progress work may still appear — ignore those).

- [ ] **Step 8: Commit**

```bash
git add src/lib/communes.ts src/lib/communes.test.ts
git commit -m "feat: add wilaya-to-commune dataset generated from courier coverage CSV"
```

---

### Task 2: Cascading commune dropdown in `OrderFormFields.tsx`

**Files:**
- Modify: `src/components/store/OrderFormFields.tsx`

- [ ] **Step 1: Import the helper**

Replace:

```ts
import { WILAYAS } from '@/lib/wilayas'
```

With:

```ts
import { WILAYAS } from '@/lib/wilayas'
import { getCommunesForWilaya } from '@/lib/communes'
```

- [ ] **Step 2: Add a dedicated wilaya-change handler that also resets commune**

Replace:

```ts
  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      behaviorTrackerRef.current?.recordInput()
      setForm(f => ({ ...f, [k]: e.target.value }))
    }
```

With:

```ts
  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      behaviorTrackerRef.current?.recordInput()
      setForm(f => ({ ...f, [k]: e.target.value }))
    }

  // A commune from the previous wilaya is very likely invalid for the new one
  // (different dataset, or none at all), so clear it on every wilaya change.
  const handleWilayaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    behaviorTrackerRef.current?.recordInput()
    const wilaya = e.target.value
    setForm(f => ({ ...f, wilaya, commune: '' }))
  }
```

- [ ] **Step 3: Wire the wilaya select to the new handler**

Replace:

```tsx
        <select value={form.wilaya} onChange={set('wilaya')} style={inputStyle}>
```

With:

```tsx
        <select value={form.wilaya} onChange={handleWilayaChange} style={inputStyle}>
```

- [ ] **Step 4: Make the commune field conditional — dropdown when data exists, free text otherwise**

Replace:

```tsx
      <div>
        <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
          {isRTL ? 'البلدية *' : 'Commune *'}
        </label>
        <input
          value={form.commune}
          onChange={set('commune')}
          placeholder={isRTL ? 'بلديتك' : 'Votre commune'}
          style={inputStyle}
        />
      </div>
```

With:

```tsx
      <div>
        <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
          {isRTL ? 'البلدية *' : 'Commune *'}
        </label>
        {(() => {
          const communes = getCommunesForWilaya(form.wilaya)
          return communes.length > 0 ? (
            <select value={form.commune} onChange={set('commune')} style={inputStyle}>
              <option value="" style={{ background: bg }}>
                {isRTL ? 'اختر بلديتك' : 'Sélectionner votre commune'}
              </option>
              {communes.map(c => (
                <option key={c} value={c} style={{ background: bg }}>{c}</option>
              ))}
            </select>
          ) : (
            <input
              value={form.commune}
              onChange={set('commune')}
              placeholder={isRTL ? 'بلديتك' : 'Votre commune'}
              style={inputStyle}
            />
          )
        })()}
      </div>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Manual verification**

On the dev server, open any published landing page or product page with the order form visible:
- Select a wilaya covered by the dataset (e.g. "Alger") → commune becomes a populated `<select>` with a placeholder option.
- Switch to a different covered wilaya → commune resets to empty and repopulates with that wilaya's list.
- Select one of the 4 uncovered wilayas (Illizi, Bordj Badji Mokhtar, In Guezzam, Djanet) → commune reverts to the free-text input.
- Fill out and submit a full order with a dropdown-selected commune → confirm it saves and appears correctly in `/dashboard/orders`.

- [ ] **Step 7: Commit**

```bash
git add src/components/store/OrderFormFields.tsx
git commit -m "feat: cascade commune dropdown from wilaya selection in the storefront order form"
```

---

### Task 3: Final full-suite check

- [ ] **Step 1: Run the whole test suite**

Run: `npm run test`
Expected: PASS — all existing tests plus the 8 new ones in `communes.test.ts` pass.

- [ ] **Step 2: Run the linter**

Run: `npx eslint src/lib/communes.ts src/lib/communes.test.ts src/components/store/OrderFormFields.tsx`
Expected: no new errors (pre-existing warnings elsewhere in the codebase are out of scope).

- [ ] **Step 3: Full typecheck**

Run: `npx tsc --noEmit`
Expected: clean except pre-existing unrelated errors from other in-progress work.
