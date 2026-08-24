# Product Categories + Related Products Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a store admin create product categories and assign one category per product; the storefront product page then shows a "Vous aimerez aussi" section of other products from the same category to encourage further browsing.

**Architecture:** New `categories` table (one row per store-defined category) + `products.category_id` nullable FK (one category per product). Admin manages categories through a new `/dashboard/products/categories` page and a `/api/categories` route, and picks a product's category from a new dropdown on the existing product create/edit forms. The storefront's single product-page route (`ThemedLanding.tsx`) and the standalone product route (`StandaloneProductView.tsx`) each grow one new "related products" section fed by a query the page-level server components already run.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + RLS), Tailwind (`dash-*` tokens for admin UI), vitest for API route tests.

Reference spec: [`docs/superpowers/specs/2026-08-24-cart-and-categories-design.md`](../specs/2026-08-24-cart-and-categories-design.md) — Part B.

---

### Task 1: Database migration — `categories` table + `products.category_id`

**Files:**
- Create: `database/061_product_categories.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- 061 — Product categories (admin-defined, one per product).
-- Idempotent — safe to run multiple times. Paste into Supabase → SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_categories_store_id ON categories(store_id);

ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store owners can manage own categories"
  ON categories FOR ALL
  TO authenticated
  USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_super_admin()
  )
  WITH CHECK (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_super_admin()
  );

CREATE POLICY "Public can read categories"
  ON categories FOR SELECT
  TO anon
  USING (true);

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Run it**

Paste into Supabase → SQL Editor → Run. Confirm no errors and that `categories` appears in the table list with RLS enabled.

- [ ] **Step 3: Commit**

```bash
git add database/061_product_categories.sql
git commit -m "feat(db): add categories table and products.category_id"
```

---

### Task 2: TypeScript types

**Files:**
- Modify: `src/types/database.ts:253-304` (Product interface)

- [ ] **Step 1: Add the `Category` interface and `category_id` field**

Insert a new interface right before the existing `Product` section header (`src/types/database.ts:250`):

```typescript
// ============================================================
// CATEGORY
// ============================================================
export interface Category {
  id: string
  store_id: string
  name: string
  slug: string
  created_at: string
}
```

Then add one field to `Product` (right after `position: number` at `src/types/database.ts:301`):

```typescript
  position: number
  // Admin-assigned category (one per product). Null = uncategorized — no
  // "related products" section is shown for that product. See
  // Database/061_product_categories.sql.
  category_id: string | null
```

- [ ] **Step 2: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(types): add Category type and Product.category_id"
```

---

### Task 3: `/api/categories` route (list / create / rename / delete)

**Files:**
- Create: `src/app/api/categories/route.ts`
- Test: `src/app/api/categories/route.test.ts`

Follows the exact pattern of `src/app/api/team/route.ts:1-34` — resolve the caller's active store via `resolveActiveStoreServer`, then use the admin client for the actual read/write (RLS already scopes it, admin client is used here only because `resolveActiveStoreServer` needs a session-bound client for `auth.getUser()` while the data operations use the same trusted-server pattern as every other dashboard API route in this codebase).

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/categories/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
let categories: Record<string, unknown>[] = []
let insertedCategory: Record<string, unknown> | null = null
let deletedId: string | null = null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  }),
}))

vi.mock('@/lib/server-store', () => ({
  resolveActiveStoreServer: async () => ({ id: 'store-1', plan: 'ultimate' }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table !== 'categories') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({ data: categories }),
          }),
        }),
        insert: (payload: Record<string, unknown>) => {
          insertedCategory = payload
          return {
            select: () => ({
              single: async () => ({ data: { id: 'cat-new', ...payload }, error: null }),
            }),
          }
        },
        delete: () => ({
          eq: (_col: string, id: string) => {
            deletedId = id
            return { eq: async () => ({ error: null }) }
          },
        }),
      }
    },
  }),
}))

import { GET, POST, DELETE } from './route'

beforeEach(() => {
  categories = [{ id: 'cat-1', store_id: 'store-1', name: 'Couvre matelas', slug: 'couvre-matelas' }]
  insertedCategory = null
  deletedId = null
})

describe('GET /api/categories', () => {
  it('lists the caller store\'s categories', async () => {
    const res = await GET()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.categories).toEqual(categories)
  })
})

describe('POST /api/categories', () => {
  it('creates a category slugified from the name', async () => {
    const req = new Request('http://test/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Oreillers Confort' }),
    })
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(insertedCategory).toMatchObject({ store_id: 'store-1', name: 'Oreillers Confort', slug: 'oreillers-confort' })
    expect(data.category.id).toBe('cat-new')
  })

  it('rejects an empty name', async () => {
    const req = new Request('http://test/api/categories', { method: 'POST', body: JSON.stringify({ name: '  ' }) })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(insertedCategory).toBeNull()
  })
})

describe('DELETE /api/categories', () => {
  it('deletes a category by id scoped to the caller store', async () => {
    const req = new Request('http://test/api/categories', { method: 'DELETE', body: JSON.stringify({ id: 'cat-1' }) })
    const res = await DELETE(req)
    expect(res.status).toBe(200)
    expect(deletedId).toBe('cat-1')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/api/categories/route.test.ts`
Expected: FAIL — `./route` has no exported member `GET`/`POST`/`DELETE` (file doesn't exist yet).

- [ ] **Step 3: Implement the route**

```typescript
// src/app/api/categories/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { createAdminClient } from '@/lib/supabase/admin'

async function ownerStore() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' as const, status: 401 }
  const store = await resolveActiveStoreServer(supabase, user.id, 'id')
  if (!store) return { error: 'Boutique introuvable' as const, status: 404 }
  return { storeId: store.id as string }
}

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

// GET → list the caller store's categories
export async function GET() {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const admin = createAdminClient()
  const { data: categories } = await admin
    .from('categories')
    .select('id, store_id, name, slug, created_at')
    .eq('store_id', s.storeId)
    .order('name')
  return NextResponse.json({ categories: categories ?? [] })
}

// POST { name } → create a category
export async function POST(request: Request) {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })

  const { name } = await request.json()
  const cleanName = String(name ?? '').trim().slice(0, 60)
  if (!cleanName) {
    return NextResponse.json({ error: 'Le nom de la catégorie est requis.' }, { status: 400 })
  }
  const slug = slugify(cleanName)
  if (!slug) {
    return NextResponse.json({ error: 'Nom de catégorie invalide.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: category, error } = await admin
    .from('categories')
    .insert({ store_id: s.storeId, name: cleanName, slug })
    .select('id, store_id, name, slug, created_at')
    .single()

  if (error) {
    const duplicate = error.code === '23505'
    return NextResponse.json(
      { error: duplicate ? 'Une catégorie avec ce nom existe déjà.' : 'Erreur lors de la création.' },
      { status: duplicate ? 409 : 500 },
    )
  }
  return NextResponse.json({ category })
}

// DELETE { id } → remove a category (products keep their row, category_id → NULL via FK ON DELETE SET NULL)
export async function DELETE(request: Request) {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'Identifiant requis.' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('store_id', s.storeId)

  if (error) return NextResponse.json({ error: 'Erreur lors de la suppression.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/categories/route.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/categories/route.ts src/app/api/categories/route.test.ts
git commit -m "feat(api): add /api/categories CRUD route"
```

---

### Task 4: Dashboard categories management page

**Files:**
- Create: `src/app/(platform)/dashboard/products/categories/page.tsx`
- Modify: `src/lib/i18n/dictionaries/fr.ts`, `src/lib/i18n/dictionaries/ar.ts`, `src/lib/i18n/dictionaries/types.ts`

Models `src/app/(platform)/dashboard/settings/team/page.tsx:1-79` (fetch/list/create/delete against a dedicated API route, `Card` + `dash-*` tokens, loading spinner, inline error/notice banners).

- [ ] **Step 1: Add i18n keys**

In `src/lib/i18n/dictionaries/types.ts`, find the `productEdit` (or nearest existing) section of the `Dictionary` type and add a sibling `categoriesPage` section:

```typescript
  categoriesPage: {
    title: string
    subtitle: string
    createPlaceholder: string
    createButton: string
    emptyTitle: string
    emptyHint: string
    deleteConfirm: string
    errorGeneric: string
  }
```

In `src/lib/i18n/dictionaries/fr.ts`, add the matching object (same nesting level as the other page-keyed sections, e.g. next to `team:`):

```typescript
  categoriesPage: {
    title: 'Catégories produits',
    subtitle: 'Regroupez vos produits pour afficher des suggestions liées sur vos pages produit.',
    createPlaceholder: 'Nom de la catégorie (ex: Couvre matelas)',
    createButton: 'Créer',
    emptyTitle: 'Aucune catégorie',
    emptyHint: 'Créez votre première catégorie pour commencer à regrouper vos produits.',
    deleteConfirm: 'Supprimer la catégorie "{name}" ? Les produits associés resteront mais perdront leur catégorie.',
    errorGeneric: 'Une erreur est survenue. Réessayez.',
  },
```

In `src/lib/i18n/dictionaries/ar.ts`, add the Darja/Arabic equivalent:

```typescript
  categoriesPage: {
    title: 'فئات المنتجات',
    subtitle: 'نظّم منتجاتك باش تبان اقتراحات مرتبطة في صفحات المنتج.',
    createPlaceholder: 'اسم الفئة (مثال: أغطية المراتب)',
    createButton: 'إنشاء',
    emptyTitle: 'ما كايناش فئات',
    emptyHint: 'أنشئ أول فئة باش تبدأ تنظّم منتجاتك.',
    deleteConfirm: 'حذف الفئة "{name}"؟ المنتجات المرتبطة بها راح تبقى ولكن بلا فئة.',
    errorGeneric: 'وقع خطأ. عاود المحاولة.',
  },
```

- [ ] **Step 2: Write the page**

```typescript
// src/app/(platform)/dashboard/products/categories/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { Tag, Plus, Loader2, Trash2 } from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import type { Category } from '@/types/database'

export default function CategoriesPage() {
  const { t } = useI18n()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const refresh = async () => {
    const res = await fetch('/api/categories')
    const data = await res.json()
    if (!data.error) setCategories(data.categories)
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  const create = async () => {
    if (!name.trim()) return
    setCreating(true); setError('')
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? t('categoriesPage.errorGeneric')); return }
      setName('')
      await refresh()
    } finally {
      setCreating(false)
    }
  }

  const remove = async (category: Category) => {
    if (!confirm(t('categoriesPage.deleteConfirm', { name: category.name }))) return
    setDeletingId(category.id)
    await fetch('/api/categories', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: category.id }),
    })
    setDeletingId(null)
    await refresh()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="animate-spin text-dash-accent" size={26} />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">{t('categoriesPage.title')}</h1>
        <p className="text-dash-ink-soft text-sm mt-1">{t('categoriesPage.subtitle')}</p>
      </div>

      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Tag size={16} className="text-dash-accent" />
          <h3 className="text-dash-ink font-bold text-sm">{t('categoriesPage.createButton')}</h3>
        </div>
        {error && <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-xl">{error}</div>}
        <div className="flex gap-2">
          <input
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) create() }}
            placeholder={t('categoriesPage.createPlaceholder')}
            className="flex-1 px-4 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm"
          />
          <button
            onClick={create}
            disabled={creating || !name.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dash-accent hover:bg-dash-accent-dark text-dash-surface font-bold text-sm transition-all disabled:opacity-50 flex-shrink-0"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {t('categoriesPage.createButton')}
          </button>
        </div>
      </Card>

      <Card padding="sm" className="divide-y divide-dash-border">
        {categories.length === 0 ? (
          <div className="py-10 text-center space-y-1">
            <p className="text-dash-ink font-semibold text-sm">{t('categoriesPage.emptyTitle')}</p>
            <p className="text-dash-ink-faint text-xs">{t('categoriesPage.emptyHint')}</p>
          </div>
        ) : (
          categories.map(category => (
            <div key={category.id} className="flex items-center justify-between py-3 px-2 first:pt-1 last:pb-1">
              <span className="text-dash-ink text-sm font-medium">{category.name}</span>
              <button
                onClick={() => remove(category)}
                disabled={deletingId === category.id}
                className="p-2 rounded-lg text-dash-ink-faint hover:text-dash-danger hover:bg-dash-danger-soft transition-all disabled:opacity-50"
              >
                {deletingId === category.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          ))
        )}
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev`, sign in as a store owner, navigate to `/dashboard/products/categories`. Create a category, confirm it appears in the list; delete it, confirm it disappears.

- [ ] **Step 4: Commit**

```bash
git add src/app/"(platform)"/dashboard/products/categories/page.tsx src/lib/i18n/dictionaries/fr.ts src/lib/i18n/dictionaries/ar.ts src/lib/i18n/dictionaries/types.ts
git commit -m "feat(dashboard): add product categories management page"
```

---

### Task 5: Category picker on the product create form

**Files:**
- Modify: `src/app/(platform)/dashboard/products/new/page.tsx:1-56, 137-162, 378-420`
- Modify: `src/lib/i18n/dictionaries/fr.ts`, `src/lib/i18n/dictionaries/ar.ts`, `src/lib/i18n/dictionaries/types.ts`

- [ ] **Step 1: Add i18n keys**

In `src/lib/i18n/dictionaries/types.ts`, extend the existing `productEdit` and `productNew` sections (do not create a new top-level section — these keys are read via `t('productEdit.categoryLabel')` from a form shared by both new/edit pages, matching how `badgesTitle` already works):

```typescript
    categoryLabel: string
    categoryNone: string
    categoryCreateNew: string
    categoryCreatePrompt: string
```

Add the same four keys inside both the `productEdit` and `productNew` blocks of `fr.ts`:

```typescript
    categoryLabel: 'Catégorie',
    categoryNone: 'Aucune catégorie',
    categoryCreateNew: '+ Créer une catégorie',
    categoryCreatePrompt: 'Nom de la nouvelle catégorie :',
```

And in `ar.ts`:

```typescript
    categoryLabel: 'الفئة',
    categoryNone: 'بلا فئة',
    categoryCreateNew: '+ إنشاء فئة',
    categoryCreatePrompt: 'اسم الفئة الجديدة:',
```

- [ ] **Step 2: Create the shared `CategorySelect` component**

A shared component avoids duplicating the fetch/create-inline logic between the new-product and edit-product pages.

```typescript
// src/components/dashboard/CategorySelect.tsx
'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import type { Category } from '@/types/database'

interface Props {
  value: string | null
  onChange: (categoryId: string | null) => void
}

export default function CategorySelect({ value, onChange }: Props) {
  const { t } = useI18n()
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(d => { if (!d.error) setCategories(d.categories) })
  }, [])

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === '__create__') {
      const name = window.prompt(t('productEdit.categoryCreatePrompt'))
      if (!name?.trim()) return
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (res.ok) {
        setCategories(prev => [...prev, data.category].sort((a, b) => a.name.localeCompare(b.name)))
        onChange(data.category.id)
      }
      return
    }
    onChange(e.target.value || null)
  }

  return (
    <select
      value={value ?? ''}
      onChange={handleChange}
      className="w-full px-4 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink outline-none focus:border-dash-accent/50 transition-all text-sm"
    >
      <option value="">{t('productEdit.categoryNone')}</option>
      {categories.map(c => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
      <option value="__create__">{t('productEdit.categoryCreateNew')}</option>
    </select>
  )
}
```

- [ ] **Step 3: Wire it into the create form**

In `src/app/(platform)/dashboard/products/new/page.tsx`, add the import (near line 17, alongside `OfferPicker`):

```typescript
import CategorySelect from '@/components/dashboard/CategorySelect'
```

Add state (near line 44, after `offer`):

```typescript
  const [categoryId, setCategoryId] = useState<string | null>(null)
```

Add it to the insert payload (in the `supabase.from('products').insert({...})` call at line 137, alongside `preferred_delivery_provider`):

```typescript
      category_id: categoryId,
```

Add the picker UI right after the badges block closes (after line 420, before the `{connectedProviders.length > 0 && (` block):

```tsx
      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-3">
        <h3 className="text-dash-ink font-semibold text-sm">{t('productEdit.categoryLabel')}</h3>
        <CategorySelect value={categoryId} onChange={setCategoryId} />
      </div>
```

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, go to `/dashboard/products/new`, confirm the "Catégorie" card appears, that the dropdown lists categories created in Task 4, that "+ Créer une catégorie" prompts and adds a new one inline, and that saving the product persists `category_id` (check via Supabase table editor or the edit page once Step 5 lands).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/CategorySelect.tsx "src/app/(platform)/dashboard/products/new/page.tsx" src/lib/i18n/dictionaries/fr.ts src/lib/i18n/dictionaries/ar.ts src/lib/i18n/dictionaries/types.ts
git commit -m "feat(dashboard): add category picker to product create form"
```

---

### Task 6: Category picker on the product edit form

**Files:**
- Modify: `src/app/(platform)/dashboard/products/[id]/page.tsx:14-46, 86, 165-200, 467-504`

Mirrors Task 5 exactly, applied to the edit page (which loads existing values instead of defaulting them).

- [ ] **Step 1: Wire the picker in**

Add the import (alongside the existing `BADGE_CATALOG` import near line 14):

```typescript
import CategorySelect from '@/components/dashboard/CategorySelect'
```

Add state (alongside `badges`/`showBadgeEmojis` near line 46):

```typescript
  const [categoryId, setCategoryId] = useState<string | null>(null)
```

Load the existing value where `badges` is hydrated from the fetched product (near line 86):

```typescript
      setCategoryId(data.category_id ?? null)
```

Include it in the update payload (in the `supabase.from('products').update({...})` call near line 165, alongside `badges`):

```typescript
      category_id: categoryId,
```

Add the same picker card used in Task 5, right after the badges block closes (mirroring the insertion point at line ~504):

```tsx
      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-3">
        <h3 className="text-dash-ink font-semibold text-sm">{t('productEdit.categoryLabel')}</h3>
        <CategorySelect value={categoryId} onChange={setCategoryId} />
      </div>
```

- [ ] **Step 2: Verify manually**

Open an existing product's edit page, confirm its saved category (or "Aucune catégorie") is pre-selected, change it, save, reopen the page and confirm it persisted.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(platform)/dashboard/products/[id]/page.tsx"
git commit -m "feat(dashboard): add category picker to product edit form"
```

---

### Task 7: `RelatedProducts` storefront component

**Files:**
- Create: `src/components/store/RelatedProducts.tsx`

A single component reused by both storefront entry points (Task 8 and Task 9) — dark-theme, consumes the same `theme.config.colors` object already threaded through `StoreOrderModal`/`OrderFormFields` (see `src/components/store/StandaloneProductView.tsx:32-38` for the exact field names).

- [ ] **Step 1: Write the component**

```typescript
// src/components/store/RelatedProducts.tsx
import Image from 'next/image'
import Link from 'next/link'
import type { Product, Store } from '@/types/database'

interface Props {
  products: Product[]
  store: Store
  // French vs Darja/Arabic heading, matching the isRTL convention used
  // throughout the store components (see getStoreLocale in lib/i18n/store).
  isRTL?: boolean
}

export default function RelatedProducts({ products, store, isRTL = false }: Props) {
  if (products.length === 0) return null

  const theme = store.theme?.config
  const cardBg = theme?.colors.card ?? '#111118'
  const text = theme?.colors.text ?? '#FFFFFF'
  const textMuted = theme?.colors.textMuted ?? '#9CA3AF'
  const border = theme?.colors.border ?? 'rgba(255,255,255,0.1)'
  const primary = theme?.colors.primary ?? '#3B82F6'

  return (
    <section className="max-w-5xl mx-auto px-5 sm:px-6 py-12" dir={isRTL ? 'rtl' : 'ltr'}>
      <h2 className="text-lg font-bold mb-5" style={{ color: text }}>
        {isRTL ? 'قد يعجبك أيضاً' : 'Vous aimerez aussi'}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {products.map(product => (
          <Link
            key={product.id}
            href={`/p/${product.landing_page_slug}`}
            className="rounded-2xl overflow-hidden transition-all hover:opacity-80"
            style={{ background: cardBg, border: `1px solid ${border}` }}
          >
            <div className="relative aspect-square">
              {product.images[0] && (
                <Image src={product.images[0]} alt={product.name} fill className="object-cover" sizes="200px" />
              )}
            </div>
            <div className="p-3 space-y-1">
              <p className="text-sm font-semibold truncate" style={{ color: text }}>{product.name}</p>
              <p className="text-sm font-bold" style={{ color: primary }}>{product.price} DA</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

Deferred to Task 8's commit — this component has no caller yet and would be dead code on its own; committing it standalone would violate the "no dead code" spirit, so bundle it with its first integration point.

---

### Task 8: Wire related products into the landing-page route (`/p/[slug]`)

**Files:**
- Modify: `src/app/(store)/p/[slug]/page.tsx:1-47`
- Modify: `src/components/store/ThemedLanding.tsx:1-24`
- Modify: `src/types/database.ts` (Product needs a `landing_page_slug` lookup — see Step 1 note)

`ThemedLanding.tsx` wraps every theme's `Landing` template plus the generic `LandingPageRenderer` fallback in one place, so adding the related-products section there (rather than in each of the 5 theme files) covers every theme with a single change.

- [ ] **Step 1: Resolve the "link to the other product's page" problem**

`RelatedProducts` (Task 7) links to `/p/${product.landing_page_slug}`, but `Product` has no such field — a product's public URL is actually its *published landing page's* `slug` (see `src/app/(store)/p/[slug]/page.tsx:33-39`, which joins `landing_pages` → `product`). Per [`publish-landing-page-creates-product` memory], every storefront-visible product already has exactly one published landing page. So the related-products query (Step 2) must join through `landing_pages` to get each candidate's slug, not query `products` alone.

- [ ] **Step 2: Fetch related products in the page**

In `src/app/(store)/p/[slug]/page.tsx`, after the existing `landingPage` fetch (line 39) and before the view-count fire-and-forget (line 43), add:

```typescript
  const { data: relatedRows } = landingPage.product?.category_id
    ? await supabase
        .from('landing_pages')
        .select('slug, product:products!inner(id, name, price, images, category_id)')
        .eq('store_id', store.id)
        .eq('is_active', true)
        .eq('product.category_id', landingPage.product.category_id)
        .neq('product_id', landingPage.product.id)
        .limit(8)
    : { data: [] }

  const relatedProducts = (relatedRows ?? []).map(row => ({
    ...(row.product as unknown as { id: string; name: string; price: number; images: string[] }),
    landing_page_slug: row.slug,
  }))
```

- [ ] **Step 3: Pass it through to `ThemedLanding`**

Change the final `return` of the same file (line 46):

```typescript
  return <ThemedLanding landingPage={landingPage} store={store} relatedProducts={relatedProducts} />
```

- [ ] **Step 4: Render the section in `ThemedLanding`**

In `src/components/store/ThemedLanding.tsx`, add the import and prop, and render `RelatedProducts` after the theme template so it always appears regardless of which of the 5 themes (or the generic fallback) is active:

```typescript
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import LandingPageRenderer from './LandingPageRenderer'
import RelatedProducts from './RelatedProducts'
import { THEME_TEMPLATES, type LandingProps } from './themes/registry'
import { getStoreLocale } from '@/lib/i18n/store'
import type { Product } from '@/types/database'

type Props = LandingProps & { relatedProducts: (Product & { landing_page_slug: string })[] }

export default function ThemedLanding(props: Props) {
  const slug = props.store.theme?.slug
  const Template = (slug && THEME_TEMPLATES[slug]?.Landing) || LandingPageRenderer
  const isRTL = getStoreLocale(props.store) === 'ar'
  return (
    <>
      <Template {...props} />
      <RelatedProducts products={props.relatedProducts} store={props.store} isRTL={isRTL} />
      {/* `?store=` keeps the dev-only subdomain simulation working; harmless
          extra query param on production, where the subdomain alone routes home. */}
      <Link
        href={`/?store=${props.store.slug}`}
        className="fixed top-4 start-4 z-50 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold backdrop-blur-md transition-opacity hover:opacity-80"
        style={{ background: 'rgba(17,17,24,0.55)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        <ArrowLeft size={13} />
        Retour à la boutique
      </Link>
    </>
  )
}
```

`RelatedProducts` (Task 7) expects a `Product`-shaped object with a `landing_page_slug` field bolted on — that matches exactly what Step 2 builds, so no further type changes are needed; `RelatedProducts`'s own `Props.products` type should be `(Product & { landing_page_slug: string })[]`, not bare `Product[]` — fix that signature now while wiring this in:

In `src/components/store/RelatedProducts.tsx`, change:

```typescript
interface Props {
  products: (Product & { landing_page_slug: string })[]
  store: Store
  isRTL?: boolean
}
```

- [ ] **Step 5: Verify manually**

Run: `npm run dev`, open a store's `/p/[slug]` for a product that has a category with siblings, confirm "Vous aimerez aussi" shows up to 8 other products in that category, that clicking one navigates to its own `/p/[slug]`, and that a product with no category (or an only-child category) renders no section at all (no empty state — per spec, this is a discovery add-on, not a primary screen).

- [ ] **Step 6: Commit**

```bash
git add src/components/store/RelatedProducts.tsx "src/app/(store)/p/[slug]/page.tsx" src/components/store/ThemedLanding.tsx
git commit -m "feat(store): show related-category products on landing pages"
```

---

### Task 9: Wire related products into the standalone product route (`/store/product/[id]`)

**Files:**
- Modify: `src/app/store/product/[id]/page.tsx:1-48`
- Modify: `src/components/store/StandaloneProductView.tsx:1-60`

- [ ] **Step 1: Fetch related products**

In `src/app/store/product/[id]/page.tsx`, after the existing `product` fetch (line 43) and before the `if (!product) notFound()` check stays where it is, add the related-products query right after that check:

```typescript
  const { data: relatedRows } = product.category_id
    ? await supabase
        .from('products')
        .select('id, name, price, images, category_id')
        .eq('store_id', store.id)
        .eq('category_id', product.category_id)
        .eq('is_active', true)
        .neq('id', product.id)
        .limit(8)
    : { data: [] }
```

This route (unlike Task 8's landing-page route) links products by their own `id` via `/store/product/[id]`, not by a landing page slug — so no join through `landing_pages` is needed here; the "link to another product" field is just its own `id`.

- [ ] **Step 2: Pass related products through**

Change the final `return` (line 47):

```typescript
  return <StandaloneProductView product={product as Product} store={store as Store} relatedProducts={(relatedRows ?? []) as Product[]} />
```

- [ ] **Step 3: Render the section in `StandaloneProductView`**

`RelatedProducts` (Task 7/8) expects a `landing_page_slug` field, but this route's related items only have an `id` and link via `/store/product/[id]`. Rather than force this route's data into `RelatedProducts`'s landing-page-slug shape, add a small local rendering block in `StandaloneProductView.tsx` — it already has every theme color variable in scope (lines 32-38), so this stays a few lines, not a new component.

In `src/components/store/StandaloneProductView.tsx`, add the prop to `Props` (line 18-21):

```typescript
interface Props {
  product: Product
  store: Store
  relatedProducts: Product[]
}
```

Update the function signature (line 23):

```typescript
export default function StandaloneProductView({ product, store, relatedProducts }: Props) {
```

Add the import at the top (alongside the other `next/*` imports):

```typescript
import Image from 'next/image'
```

(already imported at line 2 — no change needed there.)

Add the section markup just before the closing `</div>` that ends the `max-w-5xl mx-auto` wrapper (the outermost content container opened at line 62) — locate that closing tag and insert immediately above it:

```tsx
        {relatedProducts.length > 0 && (
          <section className="mt-14">
            <h2 className="text-lg font-bold mb-5" style={{ color: text }}>
              {isRTL ? 'قد يعجبك أيضاً' : 'Vous aimerez aussi'}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {relatedProducts.map(rp => (
                <Link
                  key={rp.id}
                  href={`${storeBase || '/'}store/product/${rp.id}${store.slug ? `?store=${store.slug}` : ''}`}
                  className="rounded-2xl overflow-hidden transition-all hover:opacity-80"
                  style={{ background: cardBg, border: `1px solid ${border}` }}
                >
                  <div className="relative aspect-square">
                    {rp.images[0] && (
                      <Image src={rp.images[0]} alt={rp.name} fill className="object-cover" sizes="200px" />
                    )}
                  </div>
                  <div className="p-3 space-y-1">
                    <p className="text-sm font-semibold truncate" style={{ color: text }}>{rp.name}</p>
                    <p className="text-sm font-bold" style={{ color: primary }}>{rp.price} DA</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
```

- [ ] **Step 4: Verify manually**

Open `/store/product/[id]?store=[slug]` for a categorized product, confirm the related section appears below the main product content and links navigate correctly.

- [ ] **Step 5: Commit**

```bash
git add src/app/store/product/"[id]"/page.tsx src/components/store/StandaloneProductView.tsx
git commit -m "feat(store): show related-category products on the standalone product view"
```

---

### Task 10: Run full test suite

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite**

Run: `npm run test`
Expected: all existing tests still pass, plus the new `src/app/api/categories/route.test.ts` (4 tests).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

---

## Self-review notes

- **Spec coverage:** Task 1-2 (data model), Task 3-4 (admin category CRUD page), Task 5-6 (per-product category assignment), Task 7-9 (storefront "vous aimerez aussi") — all of spec Part B is covered. The spec's explicit "hors scope" items (sub-categories, catalogue filtering) have no corresponding task, as intended.
- **Type consistency:** `RelatedProducts`'s `products` prop is `(Product & { landing_page_slug: string })[]` per Task 8 Step 4, matching what Task 8 Step 2 builds. Task 9 deliberately does NOT reuse `RelatedProducts` (different link shape — `id`-based route, not slug-based), and inlines an equivalent block instead of forcing a shared component to serve two incompatible link shapes.
- **No placeholders:** every step has complete code, exact file paths, and exact commands.
