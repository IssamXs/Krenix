# Site Builder Phase 1 (Engine + Custom Pages) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a freeform drag-and-drop page builder (Ultimate+ only) that lets store owners create, edit, and publish brand-new custom pages on their storefront, reachable at `storename.krenix.store/<slug>` and linkable from a new site-navigation menu.

**Architecture:** A recursive JSON block tree (`site_pages.blocks` draft / `published_blocks` live snapshot) rendered by one shared `<BlockRenderer>` used by both the dashboard editor canvas and the public storefront route — so editing and production output can never drift. Drag/drop and reordering use `dnd-kit`. All plan-gated mutations go through API routes (server-side `ULTIMATE_PLANS` check); reads use the existing RLS-protected client pattern already used by the landing-pages list.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + RLS), `@dnd-kit/core` + `@dnd-kit/sortable` (new dependency), Tailwind (`dash-*` tokens), vitest.

Spec: [`docs/superpowers/specs/2026-08-16-site-builder-phase1-design.md`](../specs/2026-08-16-site-builder-phase1-design.md)

---

## File Structure

**New:**
- `Database/057_site_builder.sql` — `site_pages` table + RLS
- `src/lib/site-builder/block-tree.ts` (+ `.test.ts`) — pure tree CRUD (insert/move/remove/duplicate/update/find-parent/resolve-drop-target)
- `src/lib/site-builder/block-library.ts` (+ `.test.ts`) — block type registry (label, category, default props/style)
- `src/lib/site-builder/reserved-slugs.ts` (+ `.test.ts`) — reserved slug list + slugify
- `src/lib/site-builder/starter-templates.ts` — starter template gallery data (blank + 4 layouts)
- `src/lib/site-builder/history.ts` (+ `.test.ts`) — pure undo/redo stack
- `src/lib/site-builder/style-to-css.ts` (+ `.test.ts`) — block style object → scoped CSS string
- `src/lib/site-menu.ts` (+ `.test.ts`) — resolve `settings.siteMenu` into renderable `{href,label}[]`
- `src/app/api/site-pages/route.ts` (+ `.test.ts`) — POST create
- `src/app/api/site-pages/[id]/route.ts` (+ `.test.ts`) — PATCH update, DELETE
- `src/app/api/site-pages/[id]/publish/route.ts` (+ `.test.ts`) — POST publish
- `src/app/api/site-menu/route.ts` (+ `.test.ts`) — PATCH `settings.siteMenu`
- `src/app/store/[slug]/page.tsx` — public custom-page route
- `src/components/site-builder/BlockRenderer.tsx` — recursive renderer (layout/content/conversion blocks inline)
- `src/components/site-builder/blocks/CommerceBlocks.tsx` — Product/OrderForm/Price/WhatsApp blocks
- `src/components/site-builder/blocks/CustomHtmlBlock.tsx` — sandboxed iframe embed
- `src/app/(platform)/dashboard/site-builder/page.tsx` — pages list
- `src/app/(platform)/dashboard/site-builder/new/page.tsx` — template chooser → create
- `src/app/(platform)/dashboard/site-builder/menu/page.tsx` — menu manager
- `src/app/(platform)/dashboard/site-builder/[pageId]/page.tsx` — editor shell/state
- `src/components/site-builder/editor/BuilderTopBar.tsx`
- `src/components/site-builder/editor/BuilderLeftPanel.tsx`
- `src/components/site-builder/editor/BuilderCanvas.tsx`
- `src/components/site-builder/editor/BuilderRightPanel.tsx`

**Modified:**
- `package.json` — add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- `src/types/database.ts` — `SitePage`, `SiteBlockNode`, `SiteBlockStyle`, `SiteBlockType`, `SiteMenuItem` + `siteMenu` on `StoreSettings`
- `src/lib/cache/store-cache.ts` — `getCachedSitePageBySlug`, `revalidateSitePageCache`
- `src/lib/i18n/dictionaries/{types,fr,ar}.ts` — `nav.siteBuilder` + new `siteBuilder` section
- `src/app/(platform)/dashboard/layout.tsx` — sidebar nav item
- `src/components/store/StoreHomepage.tsx` — render site menu in header
- `src/components/store/themes/{beauty,tech,sport,car,home}/*StoreHome.tsx` — splice site menu into existing `navLinks` map (one line each)

---

## Task 1: Install dnd-kit

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Install the packages**

Run: `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

- [ ] **Step 2: Verify install**

Run: `npm ls @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
Expected: all three list a resolved version, no `UNMET DEPENDENCY`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add dnd-kit for the site builder canvas"
```

---

## Task 2: Database migration — `site_pages` table + RLS

**Files:**
- Create: `Database/057_site_builder.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- 057 — Site Builder Phase 1: site_pages table
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: freeform drag-and-drop custom pages (Ultimate+), separate from
-- landing_pages (AI-generated) and the homepage editor. `blocks` is the
-- draft tree autosaved while editing; `published_blocks` is a snapshot
-- copied over only when the owner clicks Publier, so the live storefront
-- never shows an in-progress edit.
-- ============================================================

CREATE TABLE IF NOT EXISTS site_pages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  title             TEXT NOT NULL,
  slug              TEXT NOT NULL,
  blocks            JSONB NOT NULL DEFAULT '[]',
  published_blocks  JSONB,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  meta_title        TEXT,
  meta_description  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, slug)
);

ALTER TABLE site_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store owners can manage own site pages"
  ON site_pages FOR ALL
  TO authenticated
  USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_super_admin()
  )
  WITH CHECK (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_super_admin()
  );

CREATE POLICY "Public can read published site pages"
  ON site_pages FOR SELECT
  TO anon
  USING (status = 'published');

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Tell the user to run it**

This migration must be run by the project owner in the Supabase SQL editor — it is not run automatically by this plan. Flag it explicitly when this task is reported done.

- [ ] **Step 3: Commit**

```bash
git add Database/057_site_builder.sql
git commit -m "feat(site-builder): add site_pages table + RLS (migration 057)"
```

---

## Task 3: TypeScript types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Append the new types**

Add at the end of `src/types/database.ts`:

```ts
// ============================================================
// SITE BUILDER (Ultimate+) — freeform custom pages
// ============================================================
export type SitePageStatus = 'draft' | 'published'

export type SiteBlockType =
  | 'row' | 'column' | 'container' | 'spacer'
  | 'text' | 'image' | 'button' | 'video' | 'icon'
  | 'product' | 'order_form' | 'price' | 'whatsapp_button'
  | 'testimonials' | 'countdown' | 'trust_badges' | 'faq_accordion'
  | 'custom_html'

// Types that may hold children — everything else is a leaf.
export const SITE_BLOCK_CONTAINER_TYPES: SiteBlockType[] = ['row', 'column', 'container']

export interface SiteBlockStyle {
  base: Record<string, string>
  desktop?: Record<string, string>
}

export interface SiteBlockNode {
  id: string
  type: SiteBlockType
  props: Record<string, unknown>
  style: SiteBlockStyle
  children?: SiteBlockNode[]
}

export interface SitePage {
  id: string
  store_id: string
  title: string
  slug: string
  blocks: SiteBlockNode[]
  published_blocks: SiteBlockNode[] | null
  status: SitePageStatus
  meta_title: string | null
  meta_description: string | null
  created_at: string
  updated_at: string
}

export type SiteMenuItemType = 'page' | 'builtin' | 'url'

export interface SiteMenuItem {
  id: string
  label: string
  type: SiteMenuItemType
  // page: target site_pages.slug | builtin: 'home' | 'products' | url: full URL
  target: string
  order: number
}
```

- [ ] **Step 2: Add `siteMenu` to `StoreSettings`**

In the `StoreSettings` interface (same file), add after the existing `homepage?: HomepageEditorSettings` line:

```ts
  // Site Builder (Ultimate+) navigation menu: built-in links + custom pages +
  // external URLs, owner-ordered. Absent = no menu links rendered.
  siteMenu?: SiteMenuItem[]
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors (the new types are additive and unused so far).

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(site-builder): add SitePage/SiteBlockNode/SiteMenuItem types"
```

---

## Task 4: Block tree utilities (TDD)

**Files:**
- Create: `src/lib/site-builder/block-tree.ts`
- Test: `src/lib/site-builder/block-tree.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import {
  findBlock, findParent, insertBlock, removeBlock, moveBlock,
  duplicateBlock, updateBlockProps, updateBlockStyle, resolveDropTarget,
} from './block-tree'
import type { SiteBlockNode } from '@/types/database'

function leaf(id: string): SiteBlockNode {
  return { id, type: 'text', props: { text: id }, style: { base: {} } }
}
function row(id: string, children: SiteBlockNode[]): SiteBlockNode {
  return { id, type: 'row', props: {}, style: { base: {} }, children }
}

describe('findBlock', () => {
  it('finds a root block', () => {
    const tree = [leaf('a'), leaf('b')]
    expect(findBlock(tree, 'b')?.id).toBe('b')
  })
  it('finds a nested block', () => {
    const tree = [row('r1', [leaf('a'), leaf('b')])]
    expect(findBlock(tree, 'b')?.id).toBe('b')
  })
  it('returns null when missing', () => {
    expect(findBlock([leaf('a')], 'zzz')).toBeNull()
  })
})

describe('findParent', () => {
  it('returns null parent + root index for a root block', () => {
    const tree = [leaf('a'), leaf('b')]
    expect(findParent(tree, 'b')).toEqual({ parentId: null, index: 1 })
  })
  it('returns the parent id + index for a nested block', () => {
    const tree = [row('r1', [leaf('a'), leaf('b')])]
    expect(findParent(tree, 'b')).toEqual({ parentId: 'r1', index: 1 })
  })
  it('returns null when the block does not exist', () => {
    expect(findParent([leaf('a')], 'zzz')).toBeNull()
  })
})

describe('insertBlock', () => {
  it('inserts at a given root index', () => {
    const tree = [leaf('a'), leaf('c')]
    const result = insertBlock(tree, leaf('b'), null, 1)
    expect(result.map(b => b.id)).toEqual(['a', 'b', 'c'])
  })
  it('inserts into a container by id', () => {
    const tree = [row('r1', [leaf('a')])]
    const result = insertBlock(tree, leaf('b'), 'r1', 1)
    expect(result[0].children?.map(b => b.id)).toEqual(['a', 'b'])
  })
})

describe('removeBlock', () => {
  it('removes a root block', () => {
    const tree = [leaf('a'), leaf('b')]
    expect(removeBlock(tree, 'a').map(b => b.id)).toEqual(['b'])
  })
  it('removes a nested block', () => {
    const tree = [row('r1', [leaf('a'), leaf('b')])]
    expect(removeBlock(tree, 'a')[0].children?.map(b => b.id)).toEqual(['b'])
  })
})

describe('moveBlock', () => {
  it('reorders within the same parent', () => {
    const tree = [leaf('a'), leaf('b'), leaf('c')]
    const result = moveBlock(tree, 'a', null, 2)
    expect(result.map(b => b.id)).toEqual(['b', 'c', 'a'])
  })
  it('moves a block into a different container', () => {
    const tree = [row('r1', [leaf('a')]), row('r2', [leaf('b')])]
    const result = moveBlock(tree, 'a', 'r2', 0)
    expect(result[0].children?.map(b => b.id)).toEqual([])
    expect(result[1].children?.map(b => b.id)).toEqual(['a', 'b'])
  })
})

describe('duplicateBlock', () => {
  it('inserts a copy right after the original with a new id', () => {
    const tree = [leaf('a'), leaf('b')]
    const result = duplicateBlock(tree, 'a')
    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('a')
    expect(result[1].id).not.toBe('a')
    expect(result[1].props).toEqual({ text: 'a' })
    expect(result[2].id).toBe('b')
  })
  it('deep-copies children with new ids', () => {
    const tree = [row('r1', [leaf('a')])]
    const result = duplicateBlock(tree, 'r1')
    const copiedChildId = result[1].children?.[0].id
    expect(copiedChildId).toBeDefined()
    expect(copiedChildId).not.toBe('a')
  })
})

describe('updateBlockProps / updateBlockStyle', () => {
  it('merges new props into the target block only', () => {
    const tree = [leaf('a'), leaf('b')]
    const result = updateBlockProps(tree, 'a', { text: 'changed' })
    expect(result[0].props).toEqual({ text: 'changed' })
    expect(result[1].props).toEqual({ text: 'b' })
  })
  it('merges style.base without touching style.desktop', () => {
    const tree: SiteBlockNode[] = [{ id: 'a', type: 'text', props: {}, style: { base: {}, desktop: { color: 'red' } } }]
    const result = updateBlockStyle(tree, 'a', 'base', { color: 'blue' })
    expect(result[0].style).toEqual({ base: { color: 'blue' }, desktop: { color: 'red' } })
  })
})

describe('resolveDropTarget', () => {
  const tree = [row('r1', [leaf('a'), leaf('b')]), leaf('c')]

  it('resolves a "container:<id>" drop id to append at the end of that container', () => {
    expect(resolveDropTarget('container:r1', tree)).toEqual({ parentId: 'r1', index: 2 })
  })
  it('resolves dropping onto an existing block to "insert before it"', () => {
    expect(resolveDropTarget('b', tree)).toEqual({ parentId: 'r1', index: 1 })
  })
  it('resolves dropping onto a root block to insert before it at root', () => {
    expect(resolveDropTarget('c', tree)).toEqual({ parentId: null, index: 1 })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/site-builder/block-tree.test.ts`
Expected: FAIL — `Cannot find module './block-tree'`

- [ ] **Step 3: Implement**

```ts
import type { SiteBlockNode } from '@/types/database'

export function findBlock(tree: SiteBlockNode[], id: string): SiteBlockNode | null {
  for (const node of tree) {
    if (node.id === id) return node
    if (node.children) {
      const found = findBlock(node.children, id)
      if (found) return found
    }
  }
  return null
}

export function findParent(tree: SiteBlockNode[], id: string): { parentId: string | null; index: number } | null {
  const rootIndex = tree.findIndex(n => n.id === id)
  if (rootIndex !== -1) return { parentId: null, index: rootIndex }

  for (const node of tree) {
    if (!node.children) continue
    const childIndex = node.children.findIndex(c => c.id === id)
    if (childIndex !== -1) return { parentId: node.id, index: childIndex }
    const nested = findParent(node.children, id)
    if (nested) return nested
  }
  return null
}

function mapContainer(tree: SiteBlockNode[], containerId: string, fn: (children: SiteBlockNode[]) => SiteBlockNode[]): SiteBlockNode[] {
  return tree.map(node => {
    if (node.id === containerId) return { ...node, children: fn(node.children ?? []) }
    if (node.children) return { ...node, children: mapContainer(node.children, containerId, fn) }
    return node
  })
}

export function insertBlock(tree: SiteBlockNode[], block: SiteBlockNode, parentId: string | null, index: number): SiteBlockNode[] {
  if (parentId === null) {
    const next = [...tree]
    next.splice(index, 0, block)
    return next
  }
  return mapContainer(tree, parentId, children => {
    const next = [...children]
    next.splice(index, 0, block)
    return next
  })
}

export function removeBlock(tree: SiteBlockNode[], id: string): SiteBlockNode[] {
  return tree
    .filter(node => node.id !== id)
    .map(node => (node.children ? { ...node, children: removeBlock(node.children, id) } : node))
}

export function moveBlock(tree: SiteBlockNode[], id: string, newParentId: string | null, index: number): SiteBlockNode[] {
  const block = findBlock(tree, id)
  if (!block) return tree
  const withoutBlock = removeBlock(tree, id)
  return insertBlock(withoutBlock, block, newParentId, index)
}

function cloneWithNewIds(node: SiteBlockNode): SiteBlockNode {
  return {
    ...node,
    id: crypto.randomUUID(),
    props: { ...node.props },
    style: { base: { ...node.style.base }, ...(node.style.desktop ? { desktop: { ...node.style.desktop } } : {}) },
    children: node.children?.map(cloneWithNewIds),
  }
}

export function duplicateBlock(tree: SiteBlockNode[], id: string): SiteBlockNode[] {
  const parent = findParent(tree, id)
  const block = findBlock(tree, id)
  if (!parent || !block) return tree
  const copy = cloneWithNewIds(block)
  return insertBlock(tree, copy, parent.parentId, parent.index + 1)
}

export function updateBlockProps(tree: SiteBlockNode[], id: string, props: Record<string, unknown>): SiteBlockNode[] {
  return tree.map(node => {
    if (node.id === id) return { ...node, props: { ...node.props, ...props } }
    if (node.children) return { ...node, children: updateBlockProps(node.children, id, props) }
    return node
  })
}

export function updateBlockStyle(
  tree: SiteBlockNode[], id: string, breakpoint: 'base' | 'desktop', patch: Record<string, string>,
): SiteBlockNode[] {
  return tree.map(node => {
    if (node.id === id) {
      const style = { ...node.style }
      style[breakpoint] = { ...(style[breakpoint] ?? {}), ...patch }
      return { ...node, style }
    }
    if (node.children) return { ...node, children: updateBlockStyle(node.children, id, breakpoint, patch) }
    return node
  })
}

/**
 * Turns a dnd-kit drop target id into an insertion point.
 * "container:<id>" → append at the end of that container's children.
 * "<blockId>" (an existing block) → insert immediately before it, in its own parent.
 */
export function resolveDropTarget(overId: string, tree: SiteBlockNode[]): { parentId: string | null; index: number } | null {
  if (overId.startsWith('container:')) {
    const containerId = overId.slice('container:'.length)
    const container = findBlock(tree, containerId)
    if (!container) return null
    return { parentId: containerId, index: container.children?.length ?? 0 }
  }
  return findParent(tree, overId)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/site-builder/block-tree.test.ts`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add src/lib/site-builder/block-tree.ts src/lib/site-builder/block-tree.test.ts
git commit -m "feat(site-builder): add block tree CRUD utilities"
```

---

## Task 5: Block library registry (TDD)

**Files:**
- Create: `src/lib/site-builder/block-library.ts`
- Test: `src/lib/site-builder/block-library.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { BLOCK_LIBRARY, getBlockLibraryEntry, createBlock } from './block-library'
import { SITE_BLOCK_CONTAINER_TYPES, type SiteBlockType } from '@/types/database'

const ALL_TYPES: SiteBlockType[] = [
  'row', 'column', 'container', 'spacer',
  'text', 'image', 'button', 'video', 'icon',
  'product', 'order_form', 'price', 'whatsapp_button',
  'testimonials', 'countdown', 'trust_badges', 'faq_accordion',
  'custom_html',
]

describe('BLOCK_LIBRARY', () => {
  it('has exactly one entry per SiteBlockType, no duplicates or gaps', () => {
    const types = BLOCK_LIBRARY.map(e => e.type)
    expect(new Set(types).size).toBe(types.length)
    expect(types.sort()).toEqual([...ALL_TYPES].sort())
  })

  it('marks row/column/container as containers and nothing else', () => {
    for (const entry of BLOCK_LIBRARY) {
      expect(entry.isContainer).toBe(SITE_BLOCK_CONTAINER_TYPES.includes(entry.type))
    }
  })
})

describe('getBlockLibraryEntry', () => {
  it('returns the matching entry', () => {
    expect(getBlockLibraryEntry('text').type).toBe('text')
  })
  it('throws for an unknown type (should be unreachable given SiteBlockType)', () => {
    // @ts-expect-error deliberately invalid at the type level
    expect(() => getBlockLibraryEntry('not-a-type')).toThrow()
  })
})

describe('createBlock', () => {
  it('creates a block with a fresh id, the entry defaults, and no children for a leaf', () => {
    const block = createBlock('text')
    expect(block.type).toBe('text')
    expect(block.id).toBeTruthy()
    expect(block.children).toBeUndefined()
  })
  it('creates an empty children array for a container', () => {
    const block = createBlock('row')
    expect(block.children).toEqual([])
  })
  it('generates a different id on each call', () => {
    expect(createBlock('text').id).not.toBe(createBlock('text').id)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/site-builder/block-library.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
import type { SiteBlockNode, SiteBlockType, SiteBlockStyle } from '@/types/database'
import { SITE_BLOCK_CONTAINER_TYPES } from '@/types/database'

export type BlockCategory = 'layout' | 'content' | 'commerce' | 'conversion' | 'advanced'

export interface BlockLibraryEntry {
  type: SiteBlockType
  label: string
  category: BlockCategory
  isContainer: boolean
  defaultProps: Record<string, unknown>
  defaultStyle: SiteBlockStyle
}

const PAD_STYLE: SiteBlockStyle = { base: { padding: '16px' } }
const NONE_STYLE: SiteBlockStyle = { base: {} }

export const BLOCK_LIBRARY: BlockLibraryEntry[] = [
  // Layout
  { type: 'row', label: 'Rangée', category: 'layout', isContainer: true, defaultProps: {}, defaultStyle: NONE_STYLE },
  { type: 'column', label: 'Colonne', category: 'layout', isContainer: true, defaultProps: {}, defaultStyle: PAD_STYLE },
  { type: 'container', label: 'Conteneur', category: 'layout', isContainer: true, defaultProps: {}, defaultStyle: PAD_STYLE },
  { type: 'spacer', label: 'Espaceur', category: 'layout', isContainer: false, defaultProps: {}, defaultStyle: { base: { height: '32px' } } },
  // Content
  { type: 'text', label: 'Texte', category: 'content', isContainer: false, defaultProps: { text: 'Votre texte ici' }, defaultStyle: NONE_STYLE },
  { type: 'image', label: 'Image', category: 'content', isContainer: false, defaultProps: { src: '', alt: '' }, defaultStyle: NONE_STYLE },
  { type: 'button', label: 'Bouton', category: 'content', isContainer: false, defaultProps: { text: 'Cliquez ici', href: '#' }, defaultStyle: NONE_STYLE },
  { type: 'video', label: 'Vidéo', category: 'content', isContainer: false, defaultProps: { src: '' }, defaultStyle: NONE_STYLE },
  { type: 'icon', label: 'Icône', category: 'content', isContainer: false, defaultProps: { name: 'Star' }, defaultStyle: NONE_STYLE },
  // Commerce
  { type: 'product', label: 'Produit', category: 'commerce', isContainer: false, defaultProps: { productId: null }, defaultStyle: NONE_STYLE },
  { type: 'order_form', label: 'Formulaire de commande', category: 'commerce', isContainer: false, defaultProps: { productId: null, title: 'Commander maintenant' }, defaultStyle: NONE_STYLE },
  { type: 'price', label: 'Prix', category: 'commerce', isContainer: false, defaultProps: { productId: null }, defaultStyle: NONE_STYLE },
  { type: 'whatsapp_button', label: 'Bouton WhatsApp', category: 'commerce', isContainer: false, defaultProps: { text: 'Commander sur WhatsApp' }, defaultStyle: NONE_STYLE },
  // Conversion
  { type: 'testimonials', label: 'Témoignages', category: 'conversion', isContainer: false, defaultProps: { items: [] }, defaultStyle: NONE_STYLE },
  { type: 'countdown', label: 'Compte à rebours', category: 'conversion', isContainer: false, defaultProps: { endsAt: null, text: 'Offre limitée' }, defaultStyle: NONE_STYLE },
  { type: 'trust_badges', label: 'Badges de confiance', category: 'conversion', isContainer: false, defaultProps: { items: [] }, defaultStyle: NONE_STYLE },
  { type: 'faq_accordion', label: 'FAQ', category: 'conversion', isContainer: false, defaultProps: { items: [] }, defaultStyle: NONE_STYLE },
  // Advanced
  { type: 'custom_html', label: 'HTML personnalisé', category: 'advanced', isContainer: false, defaultProps: { html: '' }, defaultStyle: NONE_STYLE },
]

const BY_TYPE = new Map(BLOCK_LIBRARY.map(e => [e.type, e]))

export function getBlockLibraryEntry(type: SiteBlockType): BlockLibraryEntry {
  const entry = BY_TYPE.get(type)
  if (!entry) throw new Error(`Unknown block type: ${type}`)
  return entry
}

export function createBlock(type: SiteBlockType): SiteBlockNode {
  const entry = getBlockLibraryEntry(type)
  const base: SiteBlockNode = {
    id: crypto.randomUUID(),
    type,
    props: { ...entry.defaultProps },
    style: { base: { ...entry.defaultStyle.base }, ...(entry.defaultStyle.desktop ? { desktop: { ...entry.defaultStyle.desktop } } : {}) },
  }
  return SITE_BLOCK_CONTAINER_TYPES.includes(type) ? { ...base, children: [] } : base
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/site-builder/block-library.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/site-builder/block-library.ts src/lib/site-builder/block-library.test.ts
git commit -m "feat(site-builder): add block library registry + createBlock"
```

---

## Task 6: Reserved slugs + slugify (TDD)

**Files:**
- Create: `src/lib/site-builder/reserved-slugs.ts`
- Test: `src/lib/site-builder/reserved-slugs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { RESERVED_SITE_PAGE_SLUGS, isReservedSlug, slugify } from './reserved-slugs'

describe('RESERVED_SITE_PAGE_SLUGS', () => {
  it('covers every existing top-level segment under src/app/store', () => {
    expect(RESERVED_SITE_PAGE_SLUGS).toEqual(expect.arrayContaining(['p', 'paiement', 'product', 'api']))
  })
})

describe('isReservedSlug', () => {
  it('is true for a reserved slug regardless of case', () => {
    expect(isReservedSlug('p')).toBe(true)
    expect(isReservedSlug('Product')).toBe(true)
  })
  it('is false for a normal slug', () => {
    expect(isReservedSlug('a-propos')).toBe(false)
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('À Propos de Nous')).toBe('a-propos-de-nous')
  })
  it('strips characters outside a-z0-9-', () => {
    expect(slugify('FAQ !!! 2024??')).toBe('faq-2024')
  })
  it('collapses repeated hyphens and trims leading/trailing ones', () => {
    expect(slugify('--hello   world--')).toBe('hello-world')
  })
  it('truncates to 80 characters', () => {
    const long = 'a'.repeat(100)
    expect(slugify(long).length).toBe(80)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/site-builder/reserved-slugs.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
// Every existing literal (non-dynamic-catch-all) top-level segment under
// src/app/store/*. A site page created with one of these slugs would be
// unreachable — Next.js resolves the static route first. Revisit this list
// whenever a new top-level route is added under src/app/store.
export const RESERVED_SITE_PAGE_SLUGS = ['p', 'paiement', 'product', 'api']

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SITE_PAGE_SLUGS.includes(slug.toLowerCase())
}

const DIACRITICS_MAP: Record<string, string> = {
  à: 'a', â: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e',
  î: 'i', ï: 'i', ô: 'o', ö: 'o', ù: 'u', û: 'u', ü: 'u', ç: 'c',
}

export function slugify(input: string): string {
  const deaccented = input
    .toLowerCase()
    .split('')
    .map(ch => DIACRITICS_MAP[ch] ?? ch)
    .join('')
  return deaccented
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/-$/, '')
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/site-builder/reserved-slugs.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/site-builder/reserved-slugs.ts src/lib/site-builder/reserved-slugs.test.ts
git commit -m "feat(site-builder): add reserved-slug validation + slugify"
```

---

## Task 7: Undo/redo history stack (TDD)

**Files:**
- Create: `src/lib/site-builder/history.ts`
- Test: `src/lib/site-builder/history.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { initHistory, pushHistory, undo, redo, HISTORY_LIMIT } from './history'

describe('initHistory', () => {
  it('starts with empty past/future', () => {
    const h = initHistory('v0')
    expect(h).toEqual({ past: [], present: 'v0', future: [] })
  })
})

describe('pushHistory', () => {
  it('moves the current present into past and clears future', () => {
    let h = initHistory('v0')
    h = pushHistory(h, 'v1')
    expect(h).toEqual({ past: ['v0'], present: 'v1', future: [] })
  })
  it('caps past at HISTORY_LIMIT entries', () => {
    let h = initHistory(0)
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) h = pushHistory(h, i)
    expect(h.past.length).toBe(HISTORY_LIMIT)
  })
})

describe('undo', () => {
  it('moves present back into future and pops the last past entry', () => {
    let h = initHistory('v0')
    h = pushHistory(h, 'v1')
    h = undo(h)
    expect(h).toEqual({ past: [], present: 'v0', future: ['v1'] })
  })
  it('is a no-op when there is no past', () => {
    const h = initHistory('v0')
    expect(undo(h)).toEqual(h)
  })
})

describe('redo', () => {
  it('re-applies the most recently undone state', () => {
    let h = initHistory('v0')
    h = pushHistory(h, 'v1')
    h = undo(h)
    h = redo(h)
    expect(h).toEqual({ past: ['v0'], present: 'v1', future: [] })
  })
  it('is a no-op when there is no future', () => {
    const h = initHistory('v0')
    expect(redo(h)).toEqual(h)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/site-builder/history.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
export interface HistoryState<T> {
  past: T[]
  present: T
  future: T[]
}

export const HISTORY_LIMIT = 50

export function initHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [] }
}

export function pushHistory<T>(state: HistoryState<T>, next: T): HistoryState<T> {
  const past = [...state.past, state.present].slice(-HISTORY_LIMIT)
  return { past, present: next, future: [] }
}

export function undo<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.past.length === 0) return state
  const present = state.past[state.past.length - 1]
  const past = state.past.slice(0, -1)
  return { past, present, future: [state.present, ...state.future] }
}

export function redo<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.future.length === 0) return state
  const present = state.future[0]
  const future = state.future.slice(1)
  return { past: [...state.past, state.present], present, future }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/site-builder/history.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/site-builder/history.ts src/lib/site-builder/history.test.ts
git commit -m "feat(site-builder): add pure undo/redo history stack"
```

---

## Task 8: Block style → CSS (TDD)

**Files:**
- Create: `src/lib/site-builder/style-to-css.ts`
- Test: `src/lib/site-builder/style-to-css.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { styleObjectToCss, blockStyleTagCss } from './style-to-css'

describe('styleObjectToCss', () => {
  it('converts camelCase keys to kebab-case CSS declarations', () => {
    expect(styleObjectToCss({ backgroundColor: 'red', padding: '8px' })).toBe('background-color:red;padding:8px')
  })
  it('returns an empty string for an empty object', () => {
    expect(styleObjectToCss({})).toBe('')
  })
})

describe('blockStyleTagCss', () => {
  it('scopes base styles to the block id selector', () => {
    const css = blockStyleTagCss('abc', { base: { color: 'blue' } })
    expect(css).toBe('[data-block-id="abc"]{color:blue}')
  })
  it('wraps desktop styles in a min-width media query', () => {
    const css = blockStyleTagCss('abc', { base: { color: 'blue' }, desktop: { color: 'red' } })
    expect(css).toBe('[data-block-id="abc"]{color:blue}@media(min-width:768px){[data-block-id="abc"]{color:red}}')
  })
  it('omits the media query entirely when there are no desktop styles', () => {
    const css = blockStyleTagCss('abc', { base: {} })
    expect(css).toBe('[data-block-id="abc"]{}')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/site-builder/style-to-css.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
import type { SiteBlockStyle } from '@/types/database'

function camelToKebab(key: string): string {
  return key.replace(/([A-Z])/g, '-$1').toLowerCase()
}

export function styleObjectToCss(style: Record<string, string>): string {
  return Object.entries(style)
    .map(([key, value]) => `${camelToKebab(key)}:${value}`)
    .join(';')
}

export function blockStyleTagCss(blockId: string, style: SiteBlockStyle): string {
  const selector = `[data-block-id="${blockId}"]`
  let css = `${selector}{${styleObjectToCss(style.base)}}`
  if (style.desktop && Object.keys(style.desktop).length > 0) {
    css += `@media(min-width:768px){${selector}{${styleObjectToCss(style.desktop)}}}`
  }
  return css
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/site-builder/style-to-css.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/site-builder/style-to-css.ts src/lib/site-builder/style-to-css.test.ts
git commit -m "feat(site-builder): add block style-to-CSS conversion"
```

---

## Task 9: Starter template gallery (data)

**Files:**
- Create: `src/lib/site-builder/starter-templates.ts`

- [ ] **Step 1: Write the file**

```ts
import type { SiteBlockNode } from '@/types/database'
import { createBlock } from './block-library'

export interface StarterTemplate {
  id: string
  label: string
  description: string
  build: () => SiteBlockNode[]
}

function textRow(text: string, styleOverride: Record<string, string> = {}): SiteBlockNode {
  const block = createBlock('text')
  block.props = { text }
  block.style = { base: { padding: '24px 16px', ...styleOverride } }
  return block
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'blank',
    label: 'Page vierge',
    description: 'Partez de zéro et construisez votre page bloc par bloc.',
    build: () => [],
  },
  {
    id: 'about',
    label: 'À propos',
    description: 'Un titre et un paragraphe pour présenter votre boutique.',
    build: () => [
      textRow('À propos de nous', { fontSize: '28px', fontWeight: '700', textAlign: 'center' }),
      textRow('Racontez votre histoire ici : qui vous êtes, ce que vous vendez, pourquoi vos clients vous font confiance.'),
    ],
  },
  {
    id: 'faq',
    label: 'FAQ',
    description: 'Un titre suivi d’un bloc de questions fréquentes.',
    build: () => {
      const faq = createBlock('faq_accordion')
      faq.props = { items: [{ question: 'Quels sont les délais de livraison ?', answer: 'Entre 2 et 5 jours selon votre wilaya.' }] }
      return [textRow('Questions fréquentes', { fontSize: '28px', fontWeight: '700', textAlign: 'center' }), faq]
    },
  },
  {
    id: 'contact',
    label: 'Contact',
    description: 'Un titre et un bouton WhatsApp pour être contacté rapidement.',
    build: () => {
      const wa = createBlock('whatsapp_button')
      wa.props = { text: 'Nous contacter sur WhatsApp' }
      return [textRow('Contactez-nous', { fontSize: '28px', fontWeight: '700', textAlign: 'center' }), wa]
    },
  },
  {
    id: 'promo',
    label: 'Page promo',
    description: 'Titre accrocheur, compte à rebours, et bouton de commande.',
    build: () => {
      const countdown = createBlock('countdown')
      countdown.props = { endsAt: null, text: 'Offre limitée dans le temps' }
      const wa = createBlock('whatsapp_button')
      wa.props = { text: 'Profiter de l’offre' }
      return [textRow('Une offre à ne pas manquer', { fontSize: '32px', fontWeight: '800', textAlign: 'center' }), countdown, wa]
    },
  },
]

export function getStarterTemplate(id: string): StarterTemplate {
  const found = STARTER_TEMPLATES.find(t => t.id === id)
  return found ?? STARTER_TEMPLATES[0]
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/site-builder/starter-templates.ts
git commit -m "feat(site-builder): add starter template gallery"
```

---

## Task 10: Site menu resolver (TDD)

**Files:**
- Create: `src/lib/site-menu.ts`
- Test: `src/lib/site-menu.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { resolveSiteMenuLinks } from './site-menu'
import type { SiteMenuItem } from '@/types/database'

describe('resolveSiteMenuLinks', () => {
  it('returns an empty array when the menu is undefined', () => {
    expect(resolveSiteMenuLinks(undefined, '')).toEqual([])
  })

  it('sorts links by order', () => {
    const menu: SiteMenuItem[] = [
      { id: '1', label: 'FAQ', type: 'page', target: 'faq', order: 1 },
      { id: '2', label: 'Accueil', type: 'builtin', target: 'home', order: 0 },
    ]
    expect(resolveSiteMenuLinks(menu, '').map(l => l.label)).toEqual(['Accueil', 'FAQ'])
  })

  it('resolves builtin home to the store root', () => {
    const menu: SiteMenuItem[] = [{ id: '1', label: 'Accueil', type: 'builtin', target: 'home', order: 0 }]
    expect(resolveSiteMenuLinks(menu, '')).toEqual([{ href: '/', label: 'Accueil' }])
  })

  it('resolves builtin products to the #produits anchor', () => {
    const menu: SiteMenuItem[] = [{ id: '1', label: 'Produits', type: 'builtin', target: 'products', order: 0 }]
    expect(resolveSiteMenuLinks(menu, '')).toEqual([{ href: '/#produits', label: 'Produits' }])
  })

  it('resolves a page link relative to the slug, honoring storeBase', () => {
    const menu: SiteMenuItem[] = [{ id: '1', label: 'FAQ', type: 'page', target: 'faq', order: 0 }]
    expect(resolveSiteMenuLinks(menu, '/store')).toEqual([{ href: '/store/faq', label: 'FAQ' }])
  })

  it('resolves an external url link as-is, ignoring storeBase', () => {
    const menu: SiteMenuItem[] = [{ id: '1', label: 'Blog', type: 'url', target: 'https://blog.example.com', order: 0 }]
    expect(resolveSiteMenuLinks(menu, '/store')).toEqual([{ href: 'https://blog.example.com', label: 'Blog' }])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/site-menu.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
import type { SiteMenuItem } from '@/types/database'

export interface ResolvedMenuLink {
  href: string
  label: string
}

export function resolveSiteMenuLinks(menu: SiteMenuItem[] | undefined, storeBase: string): ResolvedMenuLink[] {
  if (!menu || menu.length === 0) return []
  return [...menu]
    .sort((a, b) => a.order - b.order)
    .map(item => ({ href: resolveHref(item, storeBase), label: item.label }))
}

function resolveHref(item: SiteMenuItem, storeBase: string): string {
  if (item.type === 'url') return item.target
  if (item.type === 'builtin') {
    if (item.target === 'products') return `${storeBase}/#produits`
    return `${storeBase}/`
  }
  // type === 'page'
  return `${storeBase}/${item.target}`
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/site-menu.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/site-menu.ts src/lib/site-menu.test.ts
git commit -m "feat(site-builder): add site menu link resolver"
```

---

## Task 11: API route — create site page (TDD)

**Files:**
- Create: `src/app/api/site-pages/route.ts`
- Test: `src/app/api/site-pages/route.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
let mockStore: { id: string; plan: string } = { id: 'store-1', plan: 'ultimate' }
const inserted: Record<string, unknown>[] = []
const existingSlugs = new Set<string>()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }),
}))

vi.mock('@/lib/server-store', () => ({
  resolveActiveStoreServer: async () => mockStore,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table !== 'site_pages') throw new Error(`unexpected table ${table}`)
      return {
        insert: (payload: Record<string, unknown>) => {
          if (existingSlugs.has(payload.slug as string)) {
            return { select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate' } }) }) }
          }
          inserted.push(payload)
          return { select: () => ({ single: async () => ({ data: { id: 'page-1', ...payload }, error: null }) }) }
        },
      }
    },
  }),
}))

import { POST } from './route'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://test/api/site-pages', { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  inserted.length = 0
  existingSlugs.clear()
  mockStore = { id: 'store-1', plan: 'ultimate' }
})

describe('POST /api/site-pages', () => {
  it('creates a page for an Ultimate+ store', async () => {
    const res = await POST(makeRequest({ title: 'À propos', slug: 'a-propos' }))
    expect(res.status).toBe(200)
    expect(inserted[0]).toMatchObject({ store_id: 'store-1', title: 'À propos', slug: 'a-propos', blocks: [] })
  })

  it('refuses a store below Ultimate', async () => {
    mockStore = { id: 'store-1', plan: 'pro' }
    const res = await POST(makeRequest({ title: 'À propos', slug: 'a-propos' }))
    expect(res.status).toBe(403)
    expect(inserted).toEqual([])
  })

  it('refuses a reserved slug', async () => {
    const res = await POST(makeRequest({ title: 'Produits', slug: 'product' }))
    expect(res.status).toBe(400)
    expect(inserted).toEqual([])
  })

  it('refuses a missing title', async () => {
    const res = await POST(makeRequest({ title: '  ', slug: 'x' }))
    expect(res.status).toBe(400)
  })

  it('returns 409 on a duplicate slug', async () => {
    existingSlugs.add('faq')
    const res = await POST(makeRequest({ title: 'FAQ', slug: 'faq' }))
    expect(res.status).toBe(409)
  })

  it('accepts an initial blocks array from a starter template', async () => {
    const blocks = [{ id: 'b1', type: 'text', props: { text: 'hi' }, style: { base: {} } }]
    const res = await POST(makeRequest({ title: 'Promo', slug: 'promo', blocks }))
    expect(res.status).toBe(200)
    expect(inserted[0]).toMatchObject({ blocks })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/app/api/site-pages/route.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { ULTIMATE_PLANS, type Plan, type SiteBlockNode } from '@/types/database'
import { isReservedSlug, slugify } from '@/lib/site-builder/reserved-slugs'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan')
    if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

    if (!ULTIMATE_PLANS.includes(store.plan as Plan)) {
      return NextResponse.json({ error: 'Le constructeur de site nécessite le plan Ultimate ou supérieur.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const rawSlug = typeof body.slug === 'string' ? body.slug : ''
    const slug = slugify(rawSlug || title)
    const blocks: SiteBlockNode[] = Array.isArray(body.blocks) ? body.blocks : []

    if (!title) return NextResponse.json({ error: 'Titre requis.' }, { status: 400 })
    if (!slug) return NextResponse.json({ error: 'Slug invalide.' }, { status: 400 })
    if (isReservedSlug(slug)) return NextResponse.json({ error: 'Ce slug est réservé, choisissez-en un autre.' }, { status: 400 })

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('site_pages')
      .insert({ store_id: store.id, title, slug, blocks })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Une page avec ce slug existe déjà.' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ page: data })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/app/api/site-pages/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/site-pages/route.ts src/app/api/site-pages/route.test.ts
git commit -m "feat(site-builder): add POST /api/site-pages (plan-gated create)"
```

---

## Task 12: API route — update + delete site page (TDD)

**Files:**
- Create: `src/app/api/site-pages/[id]/route.ts`
- Test: `src/app/api/site-pages/[id]/route.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
let mockStore: { id: string; plan: string } = { id: 'store-1', plan: 'ultimate' }
const pages: Record<string, unknown>[] = [{ id: 'page-1', store_id: 'store-1', title: 'FAQ', slug: 'faq' }]
const updates: Record<string, unknown>[] = []
const deletedIds: string[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }),
}))

vi.mock('@/lib/server-store', () => ({
  resolveActiveStoreServer: async () => mockStore,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table !== 'site_pages') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({ eq: (_c: string, id: string) => ({ single: async () => ({ data: pages.find(p => p.id === id) ?? null }) }) }),
        update: (payload: Record<string, unknown>) => ({
          eq: (_c: string, id: string) => ({
            select: () => ({
              single: async () => {
                updates.push({ id, ...payload })
                return { data: { ...pages.find(p => p.id === id), ...payload }, error: null }
              },
            }),
          }),
        }),
        delete: () => ({ eq: async (_c: string, id: string) => { deletedIds.push(id); return { error: null } } }),
      }
    },
  }),
}))

import { PATCH, DELETE } from './route'

function makeRequest(method: string, body?: Record<string, unknown>) {
  return new Request('http://test/api/site-pages/page-1', { method, body: body ? JSON.stringify(body) : undefined })
}
const params = { params: Promise.resolve({ id: 'page-1' }) }

beforeEach(() => {
  updates.length = 0
  deletedIds.length = 0
  mockStore = { id: 'store-1', plan: 'ultimate' }
})

describe('PATCH /api/site-pages/[id]', () => {
  it('updates the blocks of an owned page', async () => {
    const blocks = [{ id: 'b1', type: 'text', props: {}, style: { base: {} } }]
    const res = await PATCH(makeRequest('PATCH', { blocks }), params)
    expect(res.status).toBe(200)
    expect(updates[0]).toMatchObject({ id: 'page-1', blocks })
  })

  it('refuses a page belonging to another store', async () => {
    mockStore = { id: 'store-OTHER', plan: 'ultimate' }
    const res = await PATCH(makeRequest('PATCH', { blocks: [] }), params)
    expect(res.status).toBe(403)
    expect(updates).toEqual([])
  })

  it('refuses a store below Ultimate', async () => {
    mockStore = { id: 'store-1', plan: 'pro' }
    const res = await PATCH(makeRequest('PATCH', { blocks: [] }), params)
    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/site-pages/[id]', () => {
  it('deletes an owned page', async () => {
    const res = await DELETE(makeRequest('DELETE'), params)
    expect(res.status).toBe(200)
    expect(deletedIds).toEqual(['page-1'])
  })

  it('refuses a page belonging to another store', async () => {
    mockStore = { id: 'store-OTHER', plan: 'ultimate' }
    const res = await DELETE(makeRequest('DELETE'), params)
    expect(res.status).toBe(403)
    expect(deletedIds).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run "src/app/api/site-pages/[id]/route.test.ts"`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { ULTIMATE_PLANS, type Plan } from '@/types/database'

async function authorizeOwnedPage(pageId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) } as const

  const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan')
  if (!store) return { error: NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 }) } as const
  if (!ULTIMATE_PLANS.includes(store.plan as Plan)) {
    return { error: NextResponse.json({ error: 'Le constructeur de site nécessite le plan Ultimate ou supérieur.' }, { status: 403 }) } as const
  }

  const admin = createAdminClient()
  const { data: page } = await admin.from('site_pages').select('id, store_id').eq('id', pageId).single()
  if (!page) return { error: NextResponse.json({ error: 'Page introuvable' }, { status: 404 }) } as const
  if (page.store_id !== store.id) return { error: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }) } as const

  return { admin } as const
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await authorizeOwnedPage(id)
    if (auth.error) return auth.error

    const body = await request.json().catch(() => ({}))
    const patch: Record<string, unknown> = {}
    if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim()
    if (Array.isArray(body.blocks)) patch.blocks = body.blocks
    if (typeof body.meta_title === 'string') patch.meta_title = body.meta_title
    if (typeof body.meta_description === 'string') patch.meta_description = body.meta_description

    const { data, error } = await auth.admin.from('site_pages').update(patch).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ page: data })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await authorizeOwnedPage(id)
    if (auth.error) return auth.error

    const { error } = await auth.admin.from('site_pages').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run "src/app/api/site-pages/[id]/route.test.ts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/site-pages/[id]/route.ts" "src/app/api/site-pages/[id]/route.test.ts"
git commit -m "feat(site-builder): add PATCH/DELETE /api/site-pages/[id]"
```

---

## Task 13: Cache layer — cached site page lookup

**Files:**
- Modify: `src/lib/cache/store-cache.ts`

- [ ] **Step 1: Add the cached lookup + invalidation**

Add to `src/lib/cache/store-cache.ts`, after `getCachedLandingPageBySlug`:

```ts
const SITE_PAGE_TTL_SECONDS = 60
const SITE_PAGE_TAG = 'site-page-by-slug'

/** Published custom page content, keyed by store id + slug. */
export const getCachedSitePageBySlug = unstable_cache(
  async (storeId: string, slug: string) => {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('site_pages')
      .select('id, title, slug, published_blocks, meta_title, meta_description, store_id, status')
      .eq('slug', slug)
      .eq('store_id', storeId)
      .eq('status', 'published')
      .single()
    return data
  },
  ['site-page-by-slug'],
  { revalidate: SITE_PAGE_TTL_SECONDS, tags: [SITE_PAGE_TAG] },
)

/** Call after any mutation to a site page's blocks/publish state/slug. */
export function revalidateSitePageCache() {
  revalidateTag(SITE_PAGE_TAG, 'max')
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/cache/store-cache.ts
git commit -m "feat(site-builder): add cached site-page-by-slug lookup"
```

---

## Task 14: API route — publish site page (TDD)

**Files:**
- Create: `src/app/api/site-pages/[id]/publish/route.ts`
- Test: `src/app/api/site-pages/[id]/publish/route.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
let mockStore: { id: string; plan: string } = { id: 'store-1', plan: 'ultimate' }
let page: Record<string, unknown> = { id: 'page-1', store_id: 'store-1', blocks: [{ id: 'b1', type: 'text', props: {}, style: { base: {} } }] }
const updates: Record<string, unknown>[] = []
let revalidateCalled = false

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }),
}))

vi.mock('@/lib/server-store', () => ({
  resolveActiveStoreServer: async () => mockStore,
}))

vi.mock('@/lib/cache/store-cache', () => ({
  revalidateSitePageCache: () => { revalidateCalled = true },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table !== 'site_pages') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({ eq: (_c: string, id: string) => ({ single: async () => ({ data: id === page.id ? page : null }) }) }),
        update: (payload: Record<string, unknown>) => ({
          eq: (_c: string, id: string) => ({
            select: () => ({ single: async () => { updates.push({ id, ...payload }); return { data: { ...page, ...payload }, error: null } } }),
          }),
        }),
      }
    },
  }),
}))

import { POST } from './route'

const params = { params: Promise.resolve({ id: 'page-1' }) }
function makeRequest() {
  return new Request('http://test/api/site-pages/page-1/publish', { method: 'POST' })
}

beforeEach(() => {
  updates.length = 0
  revalidateCalled = false
  mockStore = { id: 'store-1', plan: 'ultimate' }
  page = { id: 'page-1', store_id: 'store-1', blocks: [{ id: 'b1', type: 'text', props: {}, style: { base: {} } }] }
})

describe('POST /api/site-pages/[id]/publish', () => {
  it('copies blocks into published_blocks, flips status, and busts the cache', async () => {
    const res = await POST(makeRequest(), params)
    expect(res.status).toBe(200)
    expect(updates[0]).toMatchObject({ id: 'page-1', published_blocks: page.blocks, status: 'published' })
    expect(revalidateCalled).toBe(true)
  })

  it('refuses a page belonging to another store', async () => {
    mockStore = { id: 'store-OTHER', plan: 'ultimate' }
    const res = await POST(makeRequest(), params)
    expect(res.status).toBe(403)
    expect(updates).toEqual([])
  })

  it('refuses a store below Ultimate', async () => {
    mockStore = { id: 'store-1', plan: 'pro' }
    const res = await POST(makeRequest(), params)
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run "src/app/api/site-pages/[id]/publish/route.test.ts"`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { revalidateSitePageCache } from '@/lib/cache/store-cache'
import { ULTIMATE_PLANS, type Plan } from '@/types/database'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan')
    if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })
    if (!ULTIMATE_PLANS.includes(store.plan as Plan)) {
      return NextResponse.json({ error: 'Le constructeur de site nécessite le plan Ultimate ou supérieur.' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data: page } = await admin.from('site_pages').select('id, store_id, blocks').eq('id', id).single()
    if (!page) return NextResponse.json({ error: 'Page introuvable' }, { status: 404 })
    if (page.store_id !== store.id) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

    const { data, error } = await admin
      .from('site_pages')
      .update({ published_blocks: page.blocks, status: 'published' })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    revalidateSitePageCache()
    return NextResponse.json({ page: data })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run "src/app/api/site-pages/[id]/publish/route.test.ts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/site-pages/[id]/publish/route.ts" "src/app/api/site-pages/[id]/publish/route.test.ts"
git commit -m "feat(site-builder): add publish endpoint (draft to published_blocks snapshot)"
```

---

## Task 15: API route — site menu (TDD)

**Files:**
- Create: `src/app/api/site-menu/route.ts`
- Test: `src/app/api/site-menu/route.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
let mockStore: { id: string; plan: string; settings: Record<string, unknown> } = { id: 'store-1', plan: 'ultimate', settings: {} }
const updates: Record<string, unknown>[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }),
}))

vi.mock('@/lib/server-store', () => ({
  resolveActiveStoreServer: async () => mockStore,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table !== 'stores') throw new Error(`unexpected table ${table}`)
      return {
        update: (payload: Record<string, unknown>) => ({
          eq: async (_c: string, id: string) => { updates.push({ id, ...payload }); return { error: null } },
        }),
      }
    },
  }),
}))

import { PATCH } from './route'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://test/api/site-menu', { method: 'PATCH', body: JSON.stringify(body) })
}

beforeEach(() => {
  updates.length = 0
  mockStore = { id: 'store-1', plan: 'ultimate', settings: {} }
})

describe('PATCH /api/site-menu', () => {
  it('writes the menu array into settings.siteMenu, preserving other settings', async () => {
    mockStore = { id: 'store-1', plan: 'ultimate', settings: { whatsapp: '0555000000' } }
    const menu = [{ id: '1', label: 'Accueil', type: 'builtin', target: 'home', order: 0 }]
    const res = await PATCH(makeRequest({ menu }))
    expect(res.status).toBe(200)
    expect(updates[0]).toMatchObject({
      id: 'store-1',
      settings: { whatsapp: '0555000000', siteMenu: menu },
    })
  })

  it('refuses a store below Ultimate', async () => {
    mockStore = { id: 'store-1', plan: 'pro', settings: {} }
    const res = await PATCH(makeRequest({ menu: [] }))
    expect(res.status).toBe(403)
    expect(updates).toEqual([])
  })

  it('refuses a non-array menu payload', async () => {
    const res = await PATCH(makeRequest({ menu: 'nope' }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/app/api/site-menu/route.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { ULTIMATE_PLANS, type Plan } from '@/types/database'

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan, settings')
    if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })
    if (!ULTIMATE_PLANS.includes(store.plan as Plan)) {
      return NextResponse.json({ error: 'Le constructeur de site nécessite le plan Ultimate ou supérieur.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    if (!Array.isArray(body.menu)) {
      return NextResponse.json({ error: 'Menu invalide.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('stores')
      .update({ settings: { ...store.settings, siteMenu: body.menu } })
      .eq('id', store.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/app/api/site-menu/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/site-menu/route.ts src/app/api/site-menu/route.test.ts
git commit -m "feat(site-builder): add PATCH /api/site-menu"
```

---

## Task 16: Public storefront route — `/[slug]`

**Files:**
- Create: `src/app/store/[slug]/page.tsx`

- [ ] **Step 1: Write the route**

```tsx
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCachedStoreBySlug, getCachedSitePageBySlug } from '@/lib/cache/store-cache'
import BlockRenderer from '@/components/site-builder/BlockRenderer'
import type { Metadata } from 'next'
import type { SiteBlockNode, Store } from '@/types/database'

export const revalidate = 0

async function resolve(params: Promise<{ slug: string }>) {
  const { slug } = await params
  const storeSlug = (await headers()).get('x-store-slug')
  if (!storeSlug) return null
  const store = await getCachedStoreBySlug(storeSlug)
  if (!store) return null
  const page = await getCachedSitePageBySlug(store.id, slug)
  if (!page) return null
  return { store, page }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const resolved = await resolve(params)
  if (!resolved) return {}
  return {
    title: resolved.page.meta_title || resolved.page.title,
    description: resolved.page.meta_description || undefined,
  }
}

export default async function SitePageView({ params }: { params: Promise<{ slug: string }> }) {
  const resolved = await resolve(params)
  if (!resolved) notFound()
  const { store, page } = resolved

  return (
    <div style={{ minHeight: '100vh' }}>
      <BlockRenderer blocks={(page.published_blocks ?? []) as SiteBlockNode[]} store={store as Store} />
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: fails until Task 17 (`BlockRenderer`) exists — that's expected at this point; proceed to Task 17, 18, and 19 before treating this file as done. It is committed together with those tasks at the end of Task 19.

---

## Task 17: BlockRenderer — layout, content, and conversion blocks

**Files:**
- Create: `src/components/site-builder/BlockRenderer.tsx`

- [ ] **Step 1: Write the renderer**

```tsx
'use client'

import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import type { SiteBlockNode, Store } from '@/types/database'
import { blockStyleTagCss } from '@/lib/site-builder/style-to-css'
import CommerceBlockView from './blocks/CommerceBlocks'
import CustomHtmlBlockView from './blocks/CustomHtmlBlock'

interface BlockRendererProps {
  blocks: SiteBlockNode[]
  store: Store
  selectedId?: string | null
  onSelectBlock?: (id: string) => void
}

export default function BlockRenderer({ blocks, store, selectedId, onSelectBlock }: BlockRendererProps) {
  return (
    <>
      {blocks.map(node => (
        <BlockNodeView key={node.id} node={node} store={store} selectedId={selectedId} onSelectBlock={onSelectBlock} />
      ))}
    </>
  )
}

function BlockNodeView({ node, store, selectedId, onSelectBlock }: {
  node: SiteBlockNode; store: Store; selectedId?: string | null; onSelectBlock?: (id: string) => void
}) {
  const css = blockStyleTagCss(node.id, node.style)
  const handleClick = onSelectBlock
    ? (e: MouseEvent) => { e.stopPropagation(); onSelectBlock(node.id) }
    : undefined
  const outline: CSSProperties = selectedId === node.id ? { outline: '2px dashed #3f6b52', outlineOffset: '-2px' } : {}

  const children = node.children ? (
    <BlockRenderer blocks={node.children} store={store} selectedId={selectedId} onSelectBlock={onSelectBlock} />
  ) : null

  return (
    <>
      <style>{css}</style>
      <div data-block-id={node.id} onClick={handleClick} style={outline}>
        {renderBlock(node, store, children)}
      </div>
    </>
  )
}

function renderBlock(node: SiteBlockNode, store: Store, children: ReactNode) {
  switch (node.type) {
    // Layout
    case 'row':
      return <div style={{ display: 'flex', flexWrap: 'wrap' }}>{children}</div>
    case 'column':
      return <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    case 'container':
      return <div>{children}</div>
    case 'spacer':
      return <div />

    // Content
    case 'text':
      return <p>{String(node.props.text ?? '')}</p>
    case 'image': {
      const src = String(node.props.src ?? '')
      if (!src) return <div style={{ background: '#eee', minHeight: '80px' }} />
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={src} alt={String(node.props.alt ?? '')} style={{ maxWidth: '100%', display: 'block' }} />
    }
    case 'button':
      return <a href={String(node.props.href ?? '#')} style={{ display: 'inline-block' }}>{String(node.props.text ?? '')}</a>
    case 'video': {
      const src = String(node.props.src ?? '')
      return src ? <video src={src} controls style={{ maxWidth: '100%' }} /> : null
    }
    case 'icon':
      return <span aria-hidden>★</span>

    // Commerce
    case 'product':
    case 'order_form':
    case 'price':
    case 'whatsapp_button':
      return <CommerceBlockView node={node} store={store} />

    // Conversion
    case 'testimonials': {
      const items = Array.isArray(node.props.items) ? node.props.items as { name?: string; text?: string }[] : []
      return (
        <div>
          {items.map((t, i) => (
            <blockquote key={i}>
              <p>{t.text}</p>
              {t.name && <cite>{t.name}</cite>}
            </blockquote>
          ))}
        </div>
      )
    }
    case 'countdown':
      return <div>{String(node.props.text ?? '')}</div>
    case 'trust_badges': {
      const items = Array.isArray(node.props.items) ? node.props.items as { label?: string }[] : []
      return <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>{items.map((b, i) => <span key={i}>{b.label}</span>)}</div>
    }
    case 'faq_accordion': {
      const items = Array.isArray(node.props.items) ? node.props.items as { question?: string; answer?: string }[] : []
      return (
        <div>
          {items.map((f, i) => (
            <details key={i}>
              <summary>{f.question}</summary>
              <p>{f.answer}</p>
            </details>
          ))}
        </div>
      )
    }

    case 'custom_html':
      return <CustomHtmlBlockView node={node} />

    default:
      return null
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: fails until Task 18 (`CommerceBlocks`) and Task 19 (`CustomHtmlBlock`) exist — proceed to those next.

---

## Task 18: Commerce blocks (Product, Order/COD form, Price, WhatsApp button)

**Files:**
- Create: `src/components/site-builder/blocks/CommerceBlocks.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useState } from 'react'
import type { SiteBlockNode, Store } from '@/types/database'
import { WILAYAS } from '@/lib/wilayas'
import { toWaNumber } from '@/lib/whatsapp'

interface Props {
  node: SiteBlockNode
  store: Store
}

export default function CommerceBlockView({ node, store }: Props) {
  switch (node.type) {
    case 'whatsapp_button':
      return <WhatsappButton text={String(node.props.text ?? 'Commander sur WhatsApp')} store={store} />
    case 'price':
      return <PriceDisplay productId={node.props.productId as string | null} />
    case 'product':
      return <ProductEmbed productId={node.props.productId as string | null} />
    case 'order_form':
      return (
        <OrderForm
          storeId={store.id}
          productId={node.props.productId as string | null}
          title={String(node.props.title ?? 'Commander maintenant')}
        />
      )
    default:
      return null
  }
}

function WhatsappButton({ text, store }: { text: string; store: Store }) {
  const waNumber = toWaNumber(store.settings?.whatsapp)
  if (!waNumber) return null
  const href = `https://wa.me/${waNumber}?text=${encodeURIComponent(`Bonjour ${store.name}, je souhaite commander.`)}`
  return <a href={href} target="_blank" rel="noopener noreferrer">{text}</a>
}

function PriceDisplay({ productId }: { productId: string | null }) {
  if (!productId) return <span>—</span>
  // Product price is fetched by the page-level product join in a future phase;
  // Phase 1 renders whatever the block's own props carry (set from the editor's
  // product picker), keeping this block free of its own network fetch.
  return <span data-product-id={productId} />
}

function ProductEmbed({ productId }: { productId: string | null }) {
  if (!productId) return <div>Choisissez un produit dans le panneau de droite.</div>
  return <div data-product-id={productId} />
}

function OrderForm({ storeId, productId, title }: { storeId: string; productId: string | null; title: string }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [wilaya, setWilaya] = useState('')
  const [commune, setCommune] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const submit = async () => {
    setStatus('sending')
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          product_id: productId,
          customer_name: name,
          customer_phone: phone,
          wilaya,
          commune,
          quantity: 1,
          source: 'form',
        }),
      })
      setStatus(res.ok ? 'sent' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') return <p>Merci ! Votre commande a été reçue.</p>

  return (
    <div>
      <h3>{title}</h3>
      <input placeholder="Nom complet" value={name} onChange={e => setName(e.target.value)} />
      <input placeholder="Téléphone" value={phone} onChange={e => setPhone(e.target.value)} />
      <select value={wilaya} onChange={e => setWilaya(e.target.value)}>
        <option value="">Wilaya</option>
        {WILAYAS.map(w => <option key={w} value={w}>{w}</option>)}
      </select>
      <input placeholder="Commune" value={commune} onChange={e => setCommune(e.target.value)} />
      <button type="button" onClick={submit} disabled={status === 'sending' || !name || !phone || !wilaya || !commune}>
        {status === 'sending' ? 'Envoi…' : 'Commander'}
      </button>
      {status === 'error' && <p>Une erreur est survenue, réessayez.</p>}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to this file (BlockRenderer/route errors from Task 16/17 persist until Task 19).

- [ ] **Step 3: Commit**

```bash
git add src/components/site-builder/blocks/CommerceBlocks.tsx
git commit -m "feat(site-builder): add Commerce block group (product/order-form/price/whatsapp)"
```

---

## Task 19: Custom HTML block (sandboxed)

**Files:**
- Create: `src/components/site-builder/blocks/CustomHtmlBlock.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client'

import type { SiteBlockNode } from '@/types/database'

// Rendered in a sandboxed iframe (srcdoc), never dangerouslySetInnerHTML —
// isolates arbitrary owner-authored script/CSS from the rest of the
// storefront page's DOM even though it only ever runs on the owner's own
// subdomain. `allow-scripts` without `allow-same-origin` means any script
// inside runs in a unique opaque origin: it cannot reach cookies, localStorage,
// or the parent document.
export default function CustomHtmlBlockView({ node }: { node: SiteBlockNode }) {
  const html = String(node.props.html ?? '')
  if (!html) return null
  return (
    <iframe
      srcDoc={html}
      sandbox="allow-scripts"
      style={{ width: '100%', border: 'none', minHeight: '1px' }}
      title="Contenu personnalisé"
    />
  )
}
```

- [ ] **Step 2: Verify BlockRenderer, the CommerceBlocks import, and this file all compile together**

Run: `npx tsc --noEmit`
Expected: no errors in `BlockRenderer.tsx`, `CommerceBlocks.tsx`, `CustomHtmlBlock.tsx`, or `src/app/store/[slug]/page.tsx`.

- [ ] **Step 3: Commit BlockRenderer, CustomHtmlBlock, and the public route together**

```bash
git add src/components/site-builder/BlockRenderer.tsx src/components/site-builder/blocks/CustomHtmlBlock.tsx "src/app/store/[slug]/page.tsx"
git commit -m "feat(site-builder): add BlockRenderer, sandboxed custom-HTML block, and public /[slug] route"
```

---

## Task 20: i18n dictionary entries

**Files:**
- Modify: `src/lib/i18n/dictionaries/types.ts`
- Modify: `src/lib/i18n/dictionaries/fr.ts`
- Modify: `src/lib/i18n/dictionaries/ar.ts`

- [ ] **Step 1: Extend the `Dictionary` interface**

In `src/lib/i18n/dictionaries/types.ts`, add `siteBuilder: string` to the `nav` block (after `landingPages: string`):

```ts
    landingPages: string
    siteBuilder: string
```

Then add a new top-level section to the `Dictionary` interface (after the `nav` block closes):

```ts
  siteBuilder: {
    eyebrow: string
    title: string
    lockedTitle: string
    lockedRequiredPlan: string
    newPage: string
    emptyTitle: string
    emptyHint: string
    statusDraft: string
    statusPublished: string
    edit: string
    view: string
    delete: string
    confirmDelete: string
    menuTitle: string
    menuAddLink: string
    menuLabelPlaceholder: string
    menuSave: string
    menuSaved: string
    chooseTemplateTitle: string
    blankPage: string
    publish: string
    published: string
    undo: string
    redo: string
    desktop: string
    mobile: string
    tabContent: string
    tabStyle: string
    tabAdvanced: string
  }
```

- [ ] **Step 2: Add the French strings**

In `src/lib/i18n/dictionaries/fr.ts`, add `siteBuilder: 'Constructeur de site',` to the `nav` object (after `landingPages: 'Landing Pages',`), and add the new section:

```ts
  siteBuilder: {
    eyebrow: 'CONSTRUCTEUR DE SITE',
    title: 'Pages personnalisées',
    lockedTitle: 'Constructeur de site',
    lockedRequiredPlan: 'Ultimate',
    newPage: 'Nouvelle page',
    emptyTitle: 'Aucune page pour le moment',
    emptyHint: 'Créez votre première page personnalisée avec le constructeur.',
    statusDraft: 'Brouillon',
    statusPublished: 'Publiée',
    edit: 'Modifier',
    view: 'Voir',
    delete: 'Supprimer',
    confirmDelete: 'Supprimer la page "{title}" ?',
    menuTitle: 'Menu du site',
    menuAddLink: 'Ajouter un lien',
    menuLabelPlaceholder: 'Libellé du lien',
    menuSave: 'Enregistrer le menu',
    menuSaved: 'Menu enregistré',
    chooseTemplateTitle: 'Choisissez un point de départ',
    blankPage: 'Page vierge',
    publish: 'Publier',
    published: 'Publié',
    undo: 'Annuler',
    redo: 'Rétablir',
    desktop: 'Bureau',
    mobile: 'Mobile',
    tabContent: 'Contenu',
    tabStyle: 'Style',
    tabAdvanced: 'Avancé',
  },
```

- [ ] **Step 3: Add the Arabic strings**

In `src/lib/i18n/dictionaries/ar.ts`, add `siteBuilder: 'باني الموقع',` to the `nav` object, and add the matching section:

```ts
  siteBuilder: {
    eyebrow: 'باني الموقع',
    title: 'الصفحات المخصصة',
    lockedTitle: 'باني الموقع',
    lockedRequiredPlan: 'Ultimate',
    newPage: 'صفحة جديدة',
    emptyTitle: 'لا توجد صفحات بعد',
    emptyHint: 'أنشئ أول صفحة مخصصة باستخدام الباني.',
    statusDraft: 'مسودة',
    statusPublished: 'منشورة',
    edit: 'تعديل',
    view: 'عرض',
    delete: 'حذف',
    confirmDelete: 'حذف الصفحة "{title}"؟',
    menuTitle: 'قائمة الموقع',
    menuAddLink: 'إضافة رابط',
    menuLabelPlaceholder: 'عنوان الرابط',
    menuSave: 'حفظ القائمة',
    menuSaved: 'تم حفظ القائمة',
    chooseTemplateTitle: 'اختر نقطة انطلاق',
    blankPage: 'صفحة فارغة',
    publish: 'نشر',
    published: 'منشور',
    undo: 'تراجع',
    redo: 'إعادة',
    desktop: 'سطح المكتب',
    mobile: 'الجوال',
    tabContent: 'المحتوى',
    tabStyle: 'التصميم',
    tabAdvanced: 'متقدم',
  },
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors — `fr.ts satisfies Dictionary` and `ar.ts satisfies Dictionary` both still hold.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/dictionaries/types.ts src/lib/i18n/dictionaries/fr.ts src/lib/i18n/dictionaries/ar.ts
git commit -m "feat(site-builder): add i18n strings (fr/ar)"
```

---

## Task 21: Dashboard sidebar nav item

**Files:**
- Modify: `src/app/(platform)/dashboard/layout.tsx`

- [ ] **Step 1: Import the icon**

In the `lucide-react` import list, add `LayoutTemplate`:

```ts
  Palette, BarChart2, Puzzle, Users, MessageCircle, UserPlus, Contact, Building2, Plus, PlayCircle, ShieldAlert, LayoutTemplate
```

- [ ] **Step 2: Add the nav entry**

In `NAV_ALWAYS`, add after the `landingPages` entry:

```ts
  { href: '/dashboard/pages',    icon: FileText,         key: 'landingPages' as const },
  { href: '/dashboard/site-builder', icon: LayoutTemplate, key: 'siteBuilder' as const },
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors (the `siteBuilder` nav key now exists in `Dictionary['nav']` from Task 20).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(platform)/dashboard/layout.tsx"
git commit -m "feat(site-builder): add sidebar nav item"
```

---

## Task 22: Dashboard — pages list

**Files:**
- Create: `src/app/(platform)/dashboard/site-builder/page.tsx`

- [ ] **Step 1: Write the list page**

Mirrors the existing `/dashboard/pages` list (same data-fetch pattern, `Card` grid), swapping in `site_pages` and adding the `ULTIMATE_PLANS` lock.

```tsx
'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { FileText, Plus, Pencil, ExternalLink, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import { ULTIMATE_PLANS, type Plan, type SitePage, type Store } from '@/types/database'
import Card from '@/components/dashboard/ui/Card'
import LockedFeatureCard from '@/components/dashboard/ui/LockedFeatureCard'
import { useI18n } from '@/lib/i18n/LocaleProvider'

export default function SiteBuilderPagesPage() {
  const { t } = useI18n()
  const [pages, setPages] = useState<SitePage[]>([])
  const [store, setStore] = useState<Store | null>(null)
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const storeData = await resolveActiveStore(supabase, user.id) as Store | null
      if (!storeData) return
      setStore(storeData)
      if (ULTIMATE_PLANS.includes(storeData.plan as Plan)) {
        const res = await supabase.from('site_pages').select('*').eq('store_id', storeData.id).order('updated_at', { ascending: false })
        setPages((res.data ?? []) as SitePage[])
      }
      setLoading(false)
    })
  }, [])

  const getPublicUrl = (slug: string) => {
    if (!store) return ''
    return process.env.NODE_ENV === 'production'
      ? `https://${store.slug}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'krenix.store'}/${slug}`
      : `/store/${slug}?store=${store.slug}`
  }

  const deletePage = async (page: SitePage) => {
    if (!confirm(t('siteBuilder.confirmDelete', { title: page.title }))) return
    setDeletingId(page.id)
    await fetch(`/api/site-pages/${page.id}`, { method: 'DELETE' })
    setPages(prev => prev.filter(p => p.id !== page.id))
    setDeletingId(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-dash-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!store || !ULTIMATE_PLANS.includes(store.plan as Plan)) {
    return (
      <div className="max-w-2xl">
        <LockedFeatureCard title={t('siteBuilder.lockedTitle')} requiredPlan={t('siteBuilder.lockedRequiredPlan')} />
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] tracking-[0.09em] uppercase text-dash-accent font-bold">{t('siteBuilder.eyebrow')}</div>
          <h1 className="dash-font-heading font-medium text-[32px] mt-1 text-dash-ink">{t('siteBuilder.title')}</h1>
        </div>
        <Link href="/dashboard/site-builder/new" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[11px] bg-dash-accent text-dash-surface font-bold text-sm hover:bg-dash-accent-dark transition-all">
          <Plus size={16} /> {t('siteBuilder.newPage')}
        </Link>
      </motion.div>

      {pages.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 gap-4">
          <FileText size={40} className="text-dash-ink-faint" />
          <div className="text-center">
            <p className="text-dash-ink-soft font-medium">{t('siteBuilder.emptyTitle')}</p>
            <p className="text-dash-ink-faint text-sm mt-1">{t('siteBuilder.emptyHint')}</p>
          </div>
          <Link href="/dashboard/site-builder/new" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-dash-accent-soft text-dash-accent-dark text-sm hover:opacity-80 transition-all font-semibold">
            <Plus size={14} /> {t('siteBuilder.newPage')}
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pages.map((page, i) => (
            <Card key={page.id} hover delayMs={i * 50} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-dash-ink font-semibold truncate">{page.title}</p>
                  <p className="text-dash-ink-faint text-xs mt-0.5 font-mono truncate">/{page.slug}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${page.status === 'published' ? 'bg-dash-success-soft text-dash-success' : 'bg-dash-surface-2 text-dash-ink-faint'}`}>
                  {page.status === 'published' ? t('siteBuilder.statusPublished') : t('siteBuilder.statusDraft')}
                </span>
              </div>
              <div className="flex items-center gap-1.5 pt-1 border-t border-dash-border">
                <Link href={`/dashboard/site-builder/${page.id}`} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-dash-ink-soft hover:text-dash-ink hover:bg-dash-surface-2 transition-all">
                  <Pencil size={12} /> {t('siteBuilder.edit')}
                </Link>
                {page.status === 'published' && (
                  <a href={getPublicUrl(page.slug)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-dash-ink-soft hover:text-dash-ink hover:bg-dash-surface-2 transition-all">
                    <ExternalLink size={12} /> {t('siteBuilder.view')}
                  </a>
                )}
                <button onClick={() => deletePage(page)} disabled={deletingId === page.id} className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-dash-danger/60 hover:text-dash-danger hover:bg-dash-danger-soft transition-all disabled:opacity-50">
                  <Trash2 size={12} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles and lints clean**

Run: `npx tsc --noEmit && npx eslint src/app/\(platform\)/dashboard/site-builder/page.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(platform)/dashboard/site-builder/page.tsx"
git commit -m "feat(site-builder): add dashboard pages list (Ultimate+ gated)"
```

---

## Task 23: Dashboard — new page (template chooser)

**Files:**
- Create: `src/app/(platform)/dashboard/site-builder/new/page.tsx`

- [ ] **Step 1: Write the chooser**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Card from '@/components/dashboard/ui/Card'
import { STARTER_TEMPLATES } from '@/lib/site-builder/starter-templates'
import { slugify } from '@/lib/site-builder/reserved-slugs'
import { useI18n } from '@/lib/i18n/LocaleProvider'

export default function NewSitePagePage() {
  const { t } = useI18n()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [templateId, setTemplateId] = useState('blank')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setCreating(true)
    setError(null)
    const template = STARTER_TEMPLATES.find(t2 => t2.id === templateId) ?? STARTER_TEMPLATES[0]
    const res = await fetch('/api/site-pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, slug: slugify(title), blocks: template.build() }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Erreur')
      setCreating(false)
      return
    }
    router.push(`/dashboard/site-builder/${json.page.id}`)
  }

  return (
    <div className="max-w-3xl space-y-6">
      <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="dash-font-heading font-medium text-[28px] text-dash-ink">
        {t('siteBuilder.chooseTemplateTitle')}
      </motion.h1>

      <Card className="space-y-3">
        <label className="text-sm font-semibold text-dash-ink-soft">Titre de la page</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="À propos"
          className="w-full border border-dash-border rounded-lg px-3 py-2 text-sm"
        />
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {STARTER_TEMPLATES.map(template => (
          <Card
            key={template.id}
            hover
            onClick={() => setTemplateId(template.id)}
            className={`cursor-pointer ${templateId === template.id ? 'border-dash-accent' : ''}`}
          >
            <p className="text-dash-ink font-semibold">{template.label}</p>
            <p className="text-dash-ink-soft text-xs mt-1">{template.description}</p>
          </Card>
        ))}
      </div>

      {error && <p className="text-dash-danger text-sm">{error}</p>}

      <button
        type="button"
        onClick={create}
        disabled={creating || !title.trim()}
        className="px-5 py-2.5 rounded-[11px] bg-dash-accent text-dash-surface font-bold text-sm hover:bg-dash-accent-dark transition-all disabled:opacity-50"
      >
        {creating ? '…' : t('siteBuilder.newPage')}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(platform)/dashboard/site-builder/new/page.tsx"
git commit -m "feat(site-builder): add new-page template chooser"
```

---

## Task 24: Builder editor — top bar, left panel, right panel

**Files:**
- Create: `src/components/site-builder/editor/BuilderTopBar.tsx`
- Create: `src/components/site-builder/editor/BuilderLeftPanel.tsx`
- Create: `src/components/site-builder/editor/BuilderRightPanel.tsx`

- [ ] **Step 1: Write `BuilderTopBar.tsx`**

```tsx
'use client'

import { Undo2, Redo2, Monitor, Smartphone } from 'lucide-react'
import { useI18n } from '@/lib/i18n/LocaleProvider'

interface Props {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  device: 'base' | 'desktop'
  onDeviceChange: (device: 'base' | 'desktop') => void
  onPublish: () => void
  publishing: boolean
  saving: boolean
}

export default function BuilderTopBar({ canUndo, canRedo, onUndo, onRedo, device, onDeviceChange, onPublish, publishing, saving }: Props) {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-dash-border bg-dash-surface">
      <button type="button" onClick={onUndo} disabled={!canUndo} title={t('siteBuilder.undo')} className="w-8 h-8 rounded-lg border border-dash-border flex items-center justify-center text-dash-ink-soft disabled:opacity-30">
        <Undo2 size={14} />
      </button>
      <button type="button" onClick={onRedo} disabled={!canRedo} title={t('siteBuilder.redo')} className="w-8 h-8 rounded-lg border border-dash-border flex items-center justify-center text-dash-ink-soft disabled:opacity-30">
        <Redo2 size={14} />
      </button>
      <span className="text-xs text-dash-ink-faint ml-2">{saving ? '…' : ''}</span>
      <div className="flex-1" />
      <div className="flex rounded-lg border border-dash-border overflow-hidden">
        <button type="button" onClick={() => onDeviceChange('base')} className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${device === 'base' ? 'bg-dash-accent text-dash-surface' : 'text-dash-ink-soft'}`}>
          <Smartphone size={13} /> {t('siteBuilder.mobile')}
        </button>
        <button type="button" onClick={() => onDeviceChange('desktop')} className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${device === 'desktop' ? 'bg-dash-accent text-dash-surface' : 'text-dash-ink-soft'}`}>
          <Monitor size={13} /> {t('siteBuilder.desktop')}
        </button>
      </div>
      <div className="flex-1" />
      <button type="button" onClick={onPublish} disabled={publishing} className="px-4 py-2 rounded-[10px] bg-dash-accent text-dash-surface font-bold text-xs hover:bg-dash-accent-dark transition-all disabled:opacity-50">
        {publishing ? '…' : t('siteBuilder.publish')}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Write `BuilderLeftPanel.tsx`**

```tsx
'use client'

import { useDraggable } from '@dnd-kit/core'
import { BLOCK_LIBRARY, type BlockLibraryEntry } from '@/lib/site-builder/block-library'

function PaletteItem({ entry }: { entry: BlockLibraryEntry }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: `palette:${entry.type}` })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 } : undefined
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className="border border-dash-border rounded-xl px-2 py-2.5 text-center text-[11px] font-semibold text-dash-ink-soft cursor-grab hover:border-dash-accent hover:bg-dash-accent-soft transition-all"
    >
      {entry.label}
    </div>
  )
}

const CATEGORY_LABELS: Record<BlockLibraryEntry['category'], string> = {
  layout: 'Disposition',
  content: 'Contenu',
  commerce: 'Commerce',
  conversion: 'Conversion',
  advanced: 'Avancé',
}

export default function BuilderLeftPanel({ selectedId }: { selectedId: string | null }) {
  const categories = Array.from(new Set(BLOCK_LIBRARY.map(e => e.category)))
  return (
    <div className="w-[210px] flex-shrink-0 border-r border-dash-border bg-dash-surface overflow-y-auto p-3 space-y-5">
      {categories.map(category => (
        <div key={category}>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-dash-ink-faint mb-2">{CATEGORY_LABELS[category]}</p>
          <div className="grid grid-cols-2 gap-2">
            {BLOCK_LIBRARY.filter(e => e.category === category).map(entry => (
              <PaletteItem key={entry.type} entry={entry} />
            ))}
          </div>
        </div>
      ))}
      {selectedId && (
        <p className="text-[11px] text-dash-ink-faint pt-2 border-t border-dash-border">Bloc sélectionné : {selectedId.slice(0, 8)}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Write `BuilderRightPanel.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { SiteBlockNode } from '@/types/database'
import { useI18n } from '@/lib/i18n/LocaleProvider'

interface Props {
  block: SiteBlockNode | null
  device: 'base' | 'desktop'
  onPropsChange: (props: Record<string, unknown>) => void
  onStyleChange: (patch: Record<string, string>) => void
}

const TEXT_PROP_TYPES = new Set(['text', 'button', 'countdown', 'order_form', 'whatsapp_button'])

export default function BuilderRightPanel({ block, device, onPropsChange, onStyleChange }: Props) {
  const { t } = useI18n()
  const [tab, setTab] = useState<'content' | 'style' | 'advanced'>('content')

  if (!block) {
    return <div className="w-[220px] flex-shrink-0 border-l border-dash-border bg-dash-surface p-4 text-xs text-dash-ink-faint">Sélectionnez un bloc pour l&apos;éditer.</div>
  }

  const currentStyle = device === 'desktop' ? (block.style.desktop ?? {}) : block.style.base

  return (
    <div className="w-[220px] flex-shrink-0 border-l border-dash-border bg-dash-surface overflow-y-auto">
      <div className="flex border-b border-dash-border">
        {(['content', 'style', 'advanced'] as const).map(key => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 py-2 text-[11px] font-bold ${tab === key ? 'text-dash-accent border-b-2 border-dash-accent' : 'text-dash-ink-faint'}`}
          >
            {key === 'content' ? t('siteBuilder.tabContent') : key === 'style' ? t('siteBuilder.tabStyle') : t('siteBuilder.tabAdvanced')}
          </button>
        ))}
      </div>

      <div className="p-3 space-y-3">
        {tab === 'content' && TEXT_PROP_TYPES.has(block.type) && (
          <div>
            <label className="text-[11px] font-semibold text-dash-ink-soft block mb-1">Texte</label>
            <textarea
              className="w-full border border-dash-border rounded-lg px-2 py-1.5 text-xs"
              value={String(block.props.text ?? block.props.title ?? '')}
              onChange={e => onPropsChange(block.props.title !== undefined ? { title: e.target.value } : { text: e.target.value })}
            />
          </div>
        )}
        {tab === 'content' && block.type === 'image' && (
          <div>
            <label className="text-[11px] font-semibold text-dash-ink-soft block mb-1">URL de l&apos;image</label>
            <input
              className="w-full border border-dash-border rounded-lg px-2 py-1.5 text-xs"
              value={String(block.props.src ?? '')}
              onChange={e => onPropsChange({ src: e.target.value })}
            />
          </div>
        )}
        {tab === 'content' && block.type === 'custom_html' && (
          <div>
            <label className="text-[11px] font-semibold text-dash-ink-soft block mb-1">HTML</label>
            <textarea
              className="w-full border border-dash-border rounded-lg px-2 py-1.5 text-xs font-mono"
              rows={8}
              value={String(block.props.html ?? '')}
              onChange={e => onPropsChange({ html: e.target.value })}
            />
          </div>
        )}

        {tab === 'style' && (
          <>
            <div>
              <label className="text-[11px] font-semibold text-dash-ink-soft block mb-1">Couleur de fond</label>
              <input
                className="w-full border border-dash-border rounded-lg px-2 py-1.5 text-xs"
                value={currentStyle.backgroundColor ?? ''}
                onChange={e => onStyleChange({ backgroundColor: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-dash-ink-soft block mb-1">Espacement interne</label>
              <input
                className="w-full border border-dash-border rounded-lg px-2 py-1.5 text-xs"
                value={currentStyle.padding ?? ''}
                onChange={e => onStyleChange({ padding: e.target.value })}
              />
            </div>
          </>
        )}

        {tab === 'advanced' && (
          <p className="text-[11px] text-dash-ink-faint">ID du bloc : {block.id}</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: fails on `@dnd-kit/core` types only if Task 1 wasn't run — otherwise no errors. `BuilderCanvas` (Task 25) does not exist yet, which is expected.

- [ ] **Step 5: Commit**

```bash
git add src/components/site-builder/editor/BuilderTopBar.tsx src/components/site-builder/editor/BuilderLeftPanel.tsx src/components/site-builder/editor/BuilderRightPanel.tsx
git commit -m "feat(site-builder): add editor top bar, block palette, and style panel"
```

---

## Task 25: Builder canvas (dnd-kit)

**Files:**
- Create: `src/components/site-builder/editor/BuilderCanvas.tsx`

- [ ] **Step 1: Write the canvas**

```tsx
'use client'

import { DndContext, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import type { SiteBlockNode, Store } from '@/types/database'
import { resolveDropTarget } from '@/lib/site-builder/block-tree'
import BlockRenderer from '@/components/site-builder/BlockRenderer'

interface Props {
  blocks: SiteBlockNode[]
  store: Store
  selectedId: string | null
  onSelectBlock: (id: string) => void
  onDrop: (target: { parentId: string | null; index: number }, activeId: string) => void
}

function RootDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: 'container:root' })
  return <div ref={setNodeRef} className="kb-page min-h-[400px]">{children}</div>
}

export default function BuilderCanvas({ blocks, store, selectedId, onSelectBlock, onDrop }: Props) {
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id) === 'container:root' ? 'container:root' : String(over.id)

    // "container:root" is a synthetic id representing the page's top-level list.
    if (overId === 'container:root') {
      onDrop({ parentId: null, index: blocks.length }, activeId)
      return
    }
    const target = resolveDropTarget(overId, blocks)
    if (target) onDrop(target, activeId)
  }

  return (
    <div className="flex-1 overflow-auto bg-dash-surface-2 p-5" onClick={() => onSelectBlock('')}>
      <DndContext onDragEnd={handleDragEnd}>
        <RootDropZone>
          {blocks.length === 0 ? (
            <div className="border-2 border-dashed border-dash-border rounded-xl py-16 text-center text-dash-ink-faint text-sm">
              Glissez un bloc ici pour commencer
            </div>
          ) : (
            <BlockRenderer blocks={blocks} store={store} selectedId={selectedId} onSelectBlock={onSelectBlock} />
          )}
        </RootDropZone>
      </DndContext>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/site-builder/editor/BuilderCanvas.tsx
git commit -m "feat(site-builder): add drag-and-drop builder canvas"
```

---

## Task 26: Builder editor page (state + wiring)

**Files:**
- Create: `src/app/(platform)/dashboard/site-builder/[pageId]/page.tsx`

- [ ] **Step 1: Write the editor shell**

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { SiteBlockNode, SitePage, Store } from '@/types/database'
import { initHistory, pushHistory, undo, redo, type HistoryState } from '@/lib/site-builder/history'
import { insertBlock, moveBlock, findBlock, updateBlockProps, updateBlockStyle } from '@/lib/site-builder/block-tree'
import { createBlock } from '@/lib/site-builder/block-library'
import BuilderTopBar from '@/components/site-builder/editor/BuilderTopBar'
import BuilderLeftPanel from '@/components/site-builder/editor/BuilderLeftPanel'
import BuilderCanvas from '@/components/site-builder/editor/BuilderCanvas'
import BuilderRightPanel from '@/components/site-builder/editor/BuilderRightPanel'

const AUTOSAVE_DELAY_MS = 1500

export default function SiteBuilderEditorPage() {
  const { pageId } = useParams<{ pageId: string }>()
  const [store, setStore] = useState<Store | null>(null)
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<HistoryState<SiteBlockNode[]>>(initHistory([]))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [device, setDevice] = useState<'base' | 'desktop'>('base')
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const skipNextAutosave = useRef(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const storeData = await resolveActiveStore(supabase, user.id) as Store | null
      setStore(storeData)
      const { data } = await supabase.from('site_pages').select('*').eq('id', pageId).single()
      const page = data as SitePage | null
      if (page) {
        setHistory(initHistory(page.blocks))
      }
      setLoading(false)
    })
  }, [pageId])

  const blocks = history.present

  // Autosave: debounce writes to the draft, skip the very first render (the
  // initial load itself is not an edit).
  useEffect(() => {
    if (skipNextAutosave.current) { skipNextAutosave.current = false; return }
    setSaving(true)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await fetch(`/api/site-pages/${pageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }),
      })
      setSaving(false)
    }, AUTOSAVE_DELAY_MS)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks])

  const setBlocks = useCallback((next: SiteBlockNode[]) => {
    setHistory(h => pushHistory(h, next))
  }, [])

  const handleDrop = useCallback((target: { parentId: string | null; index: number }, activeId: string) => {
    if (activeId.startsWith('palette:')) {
      const type = activeId.slice('palette:'.length) as SiteBlockNode['type']
      const block = createBlock(type)
      setBlocks(insertBlock(blocks, block, target.parentId, target.index))
      setSelectedId(block.id)
      return
    }
    setBlocks(moveBlock(blocks, activeId, target.parentId, target.index))
  }, [blocks, setBlocks])

  const publish = async () => {
    setPublishing(true)
    await fetch(`/api/site-pages/${pageId}/publish`, { method: 'POST' })
    setPublishing(false)
  }

  if (loading || !store) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-dash-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const selectedBlock = selectedId ? findBlock(blocks, selectedId) : null

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] -m-6">
      <BuilderTopBar
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={() => setHistory(undo)}
        onRedo={() => setHistory(redo)}
        device={device}
        onDeviceChange={setDevice}
        onPublish={publish}
        publishing={publishing}
        saving={saving}
      />
      <div className="flex flex-1 min-h-0">
        <BuilderLeftPanel selectedId={selectedId} />
        <BuilderCanvas
          blocks={blocks}
          store={store}
          selectedId={selectedId}
          onSelectBlock={id => setSelectedId(id || null)}
          onDrop={handleDrop}
        />
        <BuilderRightPanel
          block={selectedBlock}
          device={device}
          onPropsChange={props => {
            if (!selectedId) return
            setBlocks(updateBlockProps(blocks, selectedId, props))
          }}
          onStyleChange={patch => {
            if (!selectedId) return
            setBlocks(updateBlockStyle(blocks, selectedId, device, patch))
          }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(platform)/dashboard/site-builder/[pageId]/page.tsx"
git commit -m "feat(site-builder): wire the editor page (state, autosave, undo/redo, publish)"
```

---

## Task 27: Dashboard — menu manager

**Files:**
- Create: `src/app/(platform)/dashboard/site-builder/menu/page.tsx`

- [ ] **Step 1: Write the menu manager**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { SiteMenuItem, SitePage, Store } from '@/types/database'
import Card from '@/components/dashboard/ui/Card'
import { Trash2, GripVertical } from 'lucide-react'
import { useI18n } from '@/lib/i18n/LocaleProvider'

export default function SiteMenuPage() {
  const { t } = useI18n()
  const [store, setStore] = useState<Store | null>(null)
  const [pages, setPages] = useState<SitePage[]>([])
  const [menu, setMenu] = useState<SiteMenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const storeData = await resolveActiveStore(supabase, user.id) as Store | null
      if (!storeData) return
      setStore(storeData)
      setMenu(storeData.settings?.siteMenu ?? [])
      const { data } = await supabase.from('site_pages').select('*').eq('store_id', storeData.id).eq('status', 'published')
      setPages((data ?? []) as SitePage[])
      setLoading(false)
    })
  }, [])

  const addLink = (type: SiteMenuItem['type']) => {
    setMenu(prev => [...prev, {
      id: crypto.randomUUID(),
      label: type === 'builtin' ? 'Accueil' : '',
      type,
      target: type === 'builtin' ? 'home' : type === 'page' ? (pages[0]?.slug ?? '') : '',
      order: prev.length,
    }])
  }

  const updateLink = (id: string, patch: Partial<SiteMenuItem>) => {
    setMenu(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item))
  }

  const removeLink = (id: string) => {
    setMenu(prev => prev.filter(item => item.id !== id).map((item, i) => ({ ...item, order: i })))
  }

  const save = async () => {
    setSaved(false)
    await fetch('/api/site-menu', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menu }),
    })
    setSaved(true)
  }

  if (loading || !store) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-dash-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">{t('siteBuilder.menuTitle')}</h1>

      <Card className="space-y-3">
        {menu.map(item => (
          <div key={item.id} className="flex items-center gap-2">
            <GripVertical size={14} className="text-dash-ink-faint flex-shrink-0" />
            <input
              value={item.label}
              onChange={e => updateLink(item.id, { label: e.target.value })}
              placeholder={t('siteBuilder.menuLabelPlaceholder')}
              className="flex-1 border border-dash-border rounded-lg px-2 py-1.5 text-sm"
            />
            {item.type === 'page' ? (
              <select value={item.target} onChange={e => updateLink(item.id, { target: e.target.value })} className="border border-dash-border rounded-lg px-2 py-1.5 text-sm">
                {pages.map(p => <option key={p.id} value={p.slug}>{p.title}</option>)}
              </select>
            ) : item.type === 'url' ? (
              <input
                value={item.target}
                onChange={e => updateLink(item.id, { target: e.target.value })}
                placeholder="https://…"
                className="border border-dash-border rounded-lg px-2 py-1.5 text-sm w-40"
              />
            ) : (
              <select value={item.target} onChange={e => updateLink(item.id, { target: e.target.value })} className="border border-dash-border rounded-lg px-2 py-1.5 text-sm">
                <option value="home">Accueil</option>
                <option value="products">Produits</option>
              </select>
            )}
            <button type="button" onClick={() => removeLink(item.id)} className="text-dash-danger/60 hover:text-dash-danger">
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <div className="flex gap-2 pt-2 border-t border-dash-border">
          <button type="button" onClick={() => addLink('builtin')} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-dash-surface-2 text-dash-ink-soft hover:opacity-80">+ Lien intégré</button>
          <button type="button" onClick={() => addLink('page')} disabled={pages.length === 0} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-dash-surface-2 text-dash-ink-soft hover:opacity-80 disabled:opacity-40">+ Page</button>
          <button type="button" onClick={() => addLink('url')} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-dash-surface-2 text-dash-ink-soft hover:opacity-80">+ {t('siteBuilder.menuAddLink')}</button>
        </div>
      </Card>

      <button type="button" onClick={save} className="px-5 py-2.5 rounded-[11px] bg-dash-accent text-dash-surface font-bold text-sm hover:bg-dash-accent-dark transition-all">
        {t('siteBuilder.menuSave')}
      </button>
      {saved && <p className="text-dash-success text-sm">{t('siteBuilder.menuSaved')}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(platform)/dashboard/site-builder/menu/page.tsx"
git commit -m "feat(site-builder): add site menu manager"
```

---

## Task 28: Wire the site menu into every store header

**Files:**
- Modify: `src/components/store/StoreHomepage.tsx`
- Modify: `src/components/store/themes/beauty/BeautyStoreHome.tsx`
- Modify: `src/components/store/themes/tech/TechStoreHome.tsx`
- Modify: `src/components/store/themes/sport/SportStoreHome.tsx`
- Modify: `src/components/store/themes/car/CarStoreHome.tsx`
- Modify: `src/components/store/themes/home/HomeStoreHome.tsx`

- [ ] **Step 1: Add the menu links import + resolution to `StoreHomepage.tsx`**

Add the import (near the other imports at the top):

```ts
import { resolveSiteMenuLinks } from '@/lib/site-menu'
```

After the existing `const commanderHref = ...` block (around line 66), add:

```ts
  const siteMenuLinks = resolveSiteMenuLinks(store.settings?.siteMenu, storeBase)
```

Then insert a `<nav>` between the logo `<div>` and the `Commander` `<a>` inside the header (the block that currently reads `</div>\n          <a\n            href={commanderHref}` around line 99–100):

```tsx
            <span className="font-bold text-lg" style={headingStyle}>{store.name}</span>
          </div>
          {siteMenuLinks.length > 0 && (
            <nav className="hidden md:flex items-center gap-6 text-sm" style={{ color: textMuted }}>
              {siteMenuLinks.map(l => <a key={l.href} href={l.href} className="hover:opacity-70 transition-opacity">{l.label}</a>)}
            </nav>
          )}
          <a
            href={commanderHref}
```

- [ ] **Step 2: Wire the 5 niche theme headers**

Each of `BeautyStoreHome.tsx`, `TechStoreHome.tsx`, `SportStoreHome.tsx`, `CarStoreHome.tsx`, `HomeStoreHome.tsx` already renders:

```tsx
<nav className="hidden md:flex items-center gap-7 text-sm ..." style={{ color: c.muted }}>
  {d.navLinks.map(l => <a key={l.href} href={l.href} className="hover:opacity-70 transition-opacity">{l.label}</a>)}
</nav>
```

Add the import to each file:

```ts
import { resolveSiteMenuLinks } from '@/lib/site-menu'
```

And change the `.map(...)` line in each file from `{d.navLinks.map(l => ...)}` to:

```tsx
  {[...d.navLinks, ...resolveSiteMenuLinks(store.settings?.siteMenu, storeBase)].map(l => <a key={l.href} href={l.href} className="hover:opacity-70 transition-opacity">{l.label}</a>)}
```

`store` and `storeBase` (or the theme's equivalent base-path variable — check the top of each file for how it computes the `/store` dev prefix; it follows the same `pathname.startsWith('/store') ? '/store' : ''` pattern as `StoreHomepage.tsx`) are already in scope in every one of these components since they already render `store.name`, `store.logo_url`, etc. Do not introduce a new prop.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors across all 6 modified files.

- [ ] **Step 4: Commit**

```bash
git add src/components/store/StoreHomepage.tsx \
  src/components/store/themes/beauty/BeautyStoreHome.tsx \
  src/components/store/themes/tech/TechStoreHome.tsx \
  src/components/store/themes/sport/SportStoreHome.tsx \
  src/components/store/themes/car/CarStoreHome.tsx \
  src/components/store/themes/home/HomeStoreHome.tsx
git commit -m "feat(site-builder): render site menu links in every store header"
```

---

## Task 29: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including every new `*.test.ts` file added in Tasks 4–15.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint the whole project**

Run: `npx eslint .`
Expected: no new errors (pre-existing warnings elsewhere in the codebase are out of scope).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual browser verification (dev server)**

Start the dev server and, using a store on the `ultimate` plan:
1. Go to `/dashboard/site-builder` — confirm the empty state, then "Nouvelle page."
2. Pick the "Promo" starter template, give it a title, create it — confirm it opens the editor with the countdown + WhatsApp blocks already on the canvas.
3. Drag a Text block from the palette onto the canvas — confirm it appears and is selectable (dashed outline).
4. Edit its text in the right panel's Content tab — confirm the canvas updates live.
5. Switch the top bar to "Bureau" (desktop), change the block's background color in the Style tab, switch back to "Mobile" — confirm the mobile style is unaffected (separate `style.base` vs `style.desktop`).
6. Click Undo — confirm the last change reverts.
7. Click Publier — confirm no error.
8. Open `/store/<slug>?store=<store-slug>` (dev) — confirm the published page renders with the same blocks.
9. Go to `/dashboard/site-builder/menu`, add the new page as a menu link, save — confirm it now appears in the storefront header nav.
10. Log in as a `pro`-plan store and visit `/dashboard/site-builder` — confirm the `LockedFeatureCard` renders instead of the builder.

Record the outcome (pass/fail per step) when reporting this task done; screenshot anything that fails before fixing it.

- [ ] **Step 6: Final commit (only if Step 5 required fixes)**

```bash
git add -A
git commit -m "fix(site-builder): address issues found in manual verification"
```

---

## Plan Self-Review Notes

- **Spec coverage:** data model (Task 2–3), routing + reserved slugs (Task 6, 16), rendering/shared renderer (Task 17–19), builder UX incl. undo/redo/device toggle/publish (Task 7, 24–26), block library incl. all 4 extra categories + custom HTML sandboxing (Task 5, 18–19), starter template chooser (Task 9, 23), plan gating (Tasks 11–12, 14–15, 22), menu manager + header wiring (Task 10, 15, 27–28) — every spec section maps to at least one task.
- **Explicitly deferred, matching the spec's non-goals:** no AI generation inside the builder, no persistent version history beyond in-session undo/redo, no per-tier page limits, no site-wide custom CSS beyond the Custom HTML block, no A/B testing hook, no real-time co-editing.
- **Cross-parent drag scope:** Phase 1's canvas supports dragging new blocks from the palette into the root page or into any existing container, and reordering/moving existing blocks via the same drop-target resolution — `resolveDropTarget` and `moveBlock` are general enough to support this without a "Phase 1.5" gap.
- **Known Phase 1 UI gap (not a placeholder, a bounded scope choice):** `BuilderRightPanel`'s Content tab (Task 24) edits text-like props and the Custom HTML/image `src` field, but does not yet include a product picker for `product` / `order_form` / `price` blocks' `productId` prop — an owner sets that value by hand today only via the (not-yet-built) product picker. Wiring a product-select dropdown into the Content tab for those three block types is a natural, small follow-up once Phase 1 ships, not required for the engine itself to work end-to-end.
