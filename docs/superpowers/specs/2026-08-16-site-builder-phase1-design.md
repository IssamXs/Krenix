# Site Builder — Phase 1 (Engine + Custom Pages)

## Context

Krenix currently offers two ways for a store owner to shape their storefront:
1. An AI landing-page generator (Claude API) whose output is edited through a fixed,
   structured-fields editor (`/dashboard/pages/[id]`).
2. A homepage editor limited to section visibility toggles, photo reordering, and an
   auto-generated product catalog (`/dashboard/settings`, shipped 2026-08-12).

Neither gives an owner free-form control over layout — you can hide/show predefined
sections, but you can't add a new block, restyle one, or build a page from scratch.
The owner asked to bring in the core value proposition of LightFunnels
(lightfunnels.com): a true drag-and-drop website builder, gated to Ultimate plan
and above, described as "just like WordPress" — full editing, full customization.

This is a large feature (freeform canvas engine + block library + homepage editing +
landing-page editing + new custom pages + nav management). Building all of it as one
spec/plan would be high-risk and slow to ship anything usable. It is phased:

- **Phase 1 (this spec)**: the builder engine itself, proven out on brand-new
  **custom pages** (a WordPress-style "Pages" feature) — no legacy content to migrate,
  lowest risk, fastest path to something real shipping.
- **Phase 2 (future spec)**: apply the same engine to redesign the **homepage**.
- **Phase 3 (future spec)**: apply the same engine to **landing pages**, replacing
  today's structured editor.

Phases 2 and 3 are out of scope here and are not designed in this document beyond
being named as the intended follow-ups.

## Goals

- Ultimate+ store owners can create, edit, and publish entirely new pages on their
  storefront using a freeform drag-and-drop canvas (rows/columns/elements, arbitrary
  nesting, per-block styling) — not a fixed set of toggleable sections.
- Published pages are reachable at `storename.krenix.store/<slug>` and can optionally
  be added to the store's navigation menu.
- The editing engine (data model, block renderer, canvas, style panel) is built to be
  reused by Phase 2/3 without rearchitecting.
- Basic/Pro plans see the feature exists (locked) but cannot use it; Ultimate and
  every plan above it get identical, unlimited access — no further tiering.

## Non-goals (Phase 1)

- No AI-assisted content generation inside the builder. It stays fully separate from
  the existing Claude landing-page generator and its credit system.
- No migration of the existing homepage or AI landing pages into the new block format.
- No persistent version history / restore-previous-version UI (in-session undo/redo
  only).
- No per-tier page-count limits (all Ultimate+ tiers get unlimited custom pages).
- No real-time multi-user co-editing.
- No site-wide custom CSS injection — the Custom HTML block is the only raw-code
  escape hatch.
- No A/B testing integration for builder pages (existing A/B testing, Business+,
  is untouched and unrelated to this feature).

## Data model

New migration `057_site_builder.sql`:

```sql
CREATE TABLE IF NOT EXISTS site_pages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  title             TEXT NOT NULL,
  slug              TEXT NOT NULL,
  blocks            JSONB NOT NULL DEFAULT '[]',   -- draft tree, autosaved while editing
  published_blocks  JSONB,                          -- snapshot copied from `blocks` on Publish; null until first publish
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  meta_title        TEXT,
  meta_description  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, slug)
);
```

RLS follows the same store-scoped pattern as `landing_pages`: owners can
read/write rows where `store_id` matches their store; the public `/[slug]` route
reads `published_blocks` via the server client, never `blocks`.

**Block tree shape** (stored in `blocks` / `published_blocks`):

```ts
type BlockNode = {
  id: string
  type: 'row' | 'column' | 'container' | 'spacer'
      | 'text' | 'image' | 'button' | 'video' | 'icon'
      | 'product' | 'order_form' | 'price' | 'whatsapp_button'
      | 'testimonials' | 'countdown' | 'trust_badges' | 'faq_accordion'
      | 'custom_html'
  props: Record<string, unknown>       // block-specific content (text value, image src, etc.)
  style: {
    base: Record<string, string>       // mobile-first default styles
    desktop?: Record<string, string>   // overrides at >=768px
  }
  children?: BlockNode[]               // row/column/container only
}
```

**Menu**: no new table. Stored as `store.settings.siteMenu`, an array of
`{ id, label, type: 'page' | 'builtin' | 'url', target, order }`, following the
existing convention of `settings.storeContent` / `settings.orderMessages` for
homepage/order config.

## Routing

- New catch-all route `src/app/(store)/[slug]/page.tsx` renders a published
  `site_pages` row for the current store (resolved the same way `/p/[slug]` already
  resolves store from subdomain).
- A fixed reserved-slug list (`p`, `paiement`, `merci`, `theme-preview`, `api`, and
  any other existing top-level store route) is enforced at page-creation time so a
  custom page can never shadow an existing route. Enforced server-side in the create
  API, not just client validation.
- Unpublished (`status = 'draft'`, `published_blocks IS NULL`) pages 404 on the public
  route even if the slug is known.

## Rendering

A single recursive `<BlockRenderer tree={BlockNode[]} />` component (new,
`src/components/site-builder/BlockRenderer.tsx`) is the only thing that turns a
block tree into DOM. It is used both by:
- the builder's live canvas (rendering `blocks`, the draft), and
- the public `/[slug]` page (rendering `published_blocks`).

This guarantees what the owner sees while editing is what customers see after
publish — no separate preview-only rendering path to drift out of sync.

**Custom HTML block**: rendered inside a sandboxed `<iframe srcdoc="...">`, not
`dangerouslySetInnerHTML`. This isolates arbitrary owner-authored script/CSS from the
rest of the storefront page's DOM even though it only ever runs on the owner's own
subdomain — cheap to build, prevents a bad embed from breaking page layout or
reaching outside its frame, matches how other builders (Notion, CodePen embeds)
handle user-authored HTML.

## Builder UX

**Entry points**: new "Constructeur de site" sidebar item, added to `NAV_ALWAYS` in
`dashboard/layout.tsx` (visible to every plan, same treatment as the existing
Chatbot nav item) so Basic/Pro see the feature exists rather than it being hidden.
Non-Ultimate+ stores land on a `LockedFeatureCard` with an upgrade CTA.

Two list screens under this section:
- **Pages** (`/dashboard/site-builder`): table of the store's `site_pages`
  (title, slug, status, last edited) — same shape as the existing landing-pages list.
  "Nouvelle page" opens a chooser: blank canvas or a small starter-template gallery
  (3–5 premade layouts: About/FAQ/Contact/Promo) before the editor opens.
- **Menu** (`/dashboard/site-builder/menu`): reorderable list of nav links —
  built-in Accueil/Produits entries, the store's custom pages, and optional external
  URLs. Writes to `settings.siteMenu`.

**Editor** (`/dashboard/site-builder/[pageId]`), inside the standard dashboard shell
(same pattern as the existing AI landing-page editor — sidebar/topbar stay, the
route uses the full content width for a 3-panel layout):

- **Left panel**: block library (draggable) + a layer tree of the current page.
- **Center canvas**: live `BlockRenderer` output. Click a block to select it (dashed
  outline). Selected block gets a floating toolbar: move up/down, duplicate, delete.
  Drag from the left panel or drag existing blocks to reorder — via `dnd-kit`
  (handles nested drop targets, actively maintained, no jQuery dependency).
- **Top toolbar**: Undo/Redo (in-memory history stack, session-only — no persisted
  version history), a Desktop/Mobile device toggle, and a **Publier** button.
- **Right panel**: Content / Style / Advanced tabs scoped to the selected block.
  Style edits write to `style.base` by default; switching the device toggle to
  Mobile edits `style.desktop` instead (base is mobile-first, desktop overrides sit
  on top — matches the project's mobile-first convention).

**Draft vs. publish**: edits autosave to `blocks` continuously while editing.
Nothing customer-facing changes until **Publier** is clicked, which copies
`blocks → published_blocks` and flips `status` to `published`. Closing the tab or
losing connection mid-edit never risks the live page.

## Block library (Phase 1)

- **Layout**: Row, Column, Container, Spacer
- **Content**: Text, Image, Button, Video, Icon
- **Commerce**: Product embed, Order/COD form, Price, WhatsApp button
- **Conversion**: Testimonials, Countdown timer, Trust badges, FAQ accordion
- **Escape hatch**: Custom HTML/embed

Commerce and conversion blocks reuse existing concepts/components where practical
(e.g. the order form logic already built for `OrderFormFields.tsx`, the trust-badge
and countdown concepts already present in the AI landing-page renderer) rather than
inventing parallel implementations.

## Plan gating

- Single gate: `ULTIMATE_PLANS.includes(store.plan)` (from `types/database.ts`),
  checked server-side in every `site_pages` / menu API route. No page-count limits,
  no tiering above Ultimate — growth/business/agency/enterprise get the same access.
- Nav item visible to all plans; page content gated via `LockedFeatureCard` for
  everyone below Ultimate.

## Cross-cutting touch points

- The 5 niche-theme headers (Beauty/Tech/Sport/Car/Home) plus the default store
  header need to read `settings.siteMenu` and render it, so custom pages actually
  become reachable via navigation. Called out explicitly since it touches existing
  theme files rather than being purely additive.
- Reserved-slug enforcement must know about every existing top-level `(store)` route,
  so it needs to be revisited if a new top-level store route is added later.

## Testing

- Unit coverage for: block-tree CRUD operations (add/move/delete/duplicate node),
  reserved-slug validation, draft→publish snapshot copy, plan-gate enforcement on API
  routes.
- Manual/browser verification: create a page from a template, add/reorder/style
  blocks including a Commerce block and the Custom HTML block, toggle mobile styles,
  publish, confirm it renders at `/<slug>` and appears in the nav menu when added.
