# KRENIX — Claude Code Brain File
> Read this entire file before doing anything. This is your single source of truth.

---

## WHAT IS KRENIX

Krenix is a multi-tenant SaaS platform for Algerian e-commerce owners and dropshippers.
Each customer gets their own store on a subdomain (e.g. `storename.krenix.store`).
The platform is sold via Meta and TikTok ads targeting the Algerian market.
All UI is in French. Chatbot supports French + Darja (Algerian Arabic dialect).

---

## YOUR ROLE

You are extending an existing project ("Le Mirage Textile") into a full multi-tenant SaaS.
- DO NOT rebuild what already exists — extend and refactor it
- DO audit every existing file before touching it
- DO keep the existing dark theme and design aesthetic
- DO ask for clarification if something is ambiguous before writing code
- DO complete one phase fully before starting the next

---

## TECH STACK

- Framework: Next.js 14+ with App Router
- Language: TypeScript (strict mode)
- Styling: Tailwind CSS only — no external UI libraries
- Database: Supabase (PostgreSQL + Row Level Security)
- Auth: Supabase Auth
- Storage: Supabase Storage
- AI Landing Pages: Claude API (model: claude-sonnet-4-6)
- AI Chatbot: Gemini API (model: gemini-2.5-flash-lite)
- Hosting: Vercel (wildcard subdomain support)

---

## BUSINESS TIERS

| Plan | Price | Type | AI Credits | Chatbot |
|---|---|---|---|---|
| basic | 15,000 DZD one-time | One-time | 5 (never resets) | DISABLED |
| pro | 3,000 DZD/mois | Subscription | 20/mois | DISABLED |
| ultimate | 9,000 DZD/mois | Subscription ⭐ Recommended | 100/mois | 150 msg/day |
| growth | 12,000 DZD/mois | Sur Mesure | 200/mois | 300 msg/day |
| business | 20,000 DZD/mois | Sur Mesure | 400/mois | 600 msg/day |
| agency | 35,000 DZD/mois | Sur Mesure | 800/mois | 1,000 msg/day |
| enterprise | 60,000 DZD/mois | Sur Mesure | 1,500/mois (shown as "illimités") | 2,000 msg/day |

### Plan hierarchy (for feature gating)
- PRO_PLANS = [pro, ultimate, growth, business, agency, enterprise, sur_mesure]
- ULTIMATE_PLANS = [ultimate, growth, business, agency, enterprise, sur_mesure]
- GROWTH_PLANS = [growth, business, agency, enterprise, sur_mesure]
- BUSINESS_PLANS = [business, agency, enterprise, sur_mesure]
- AGENCY_PLANS = [agency, enterprise, sur_mesure]

### Key feature gates
- Niche theme Beauty & Fashion: PRO_PLANS
- All 5 niche themes: ULTIMATE_PLANS
- Chatbot: ULTIMATE_PLANS
- Facebook/TikTok Pixel (manual, via GTM): ALL PLANS including basic — NOT a paid
  feature. A store owner who can't connect their own Meta/TikTok ads can't run
  the ads that sell the product (same as Shopify). Do not re-gate this.
- Facebook/TikTok Pixel (auto/server-side CAPI): GROWTH_PLANS
- Custom domain: GROWTH_PLANS
- Profit calculator: ULTIMATE_PLANS
- Yalidine integration: BUSINESS_PLANS
- A/B testing: BUSINESS_PLANS
- Customer CRM: BUSINESS_PLANS
- Auto SMS: BUSINESS_PLANS
- White label: BUSINESS_PLANS
- All delivery integrations: AGENCY_PLANS
- API access: AGENCY_PLANS
- Agency dashboard view: AGENCY_PLANS
- Dedicated infrastructure: enterprise only

### Margin protection rules
- NEVER call AI API if store.ai_credits <= 0 → block + show upgrade modal
- NEVER call Gemini if daily chatbot count >= store.chatbot_daily_limit
- Credits reset on subscription renewal ONLY
- Basic plan credits NEVER reset (one-time)
- Downgrade → freeze unused credits, do NOT delete
- Upgrade → add new tier credits to existing balance

---

## MULTI-TENANCY RULES

EVERY table that belongs to a store MUST have a `store_id` UUID column.
EVERY Supabase query from the client MUST go through RLS — never bypass with service role on client side.
The service role key is ONLY used in server-side API routes for admin operations.
Each store is identified by its `slug` which becomes its subdomain.

---

## SUBDOMAIN ROUTING

- Main platform: `krenix.store` → platform pages (landing, pricing, auth, dashboard)
- Store pages: `[slug].krenix.store` → customer-facing store
- In development: use `?store=[slug]` query param to simulate subdomains

The middleware.ts file handles all routing logic. Read it before modifying.

---

## FOLDER STRUCTURE

```
/app
  /(platform)                    Main platform pages (krenix.store)
    /page.tsx                    Platform landing page
    /pricing/page.tsx
    /auth/login/page.tsx
    /auth/register/page.tsx
    /onboarding/
      /step-1/page.tsx           Store name + slug
      /step-2/page.tsx           Logo upload
      /step-3/page.tsx           Theme selection
      /step-4/page.tsx           First product
      /complete/page.tsx         Success screen
    /dashboard/
      /page.tsx                  Overview stats
      /products/page.tsx
      /products/new/page.tsx
      /products/[id]/page.tsx
      /pages/page.tsx            Landing pages list
      /pages/new/page.tsx        AI generator
      /pages/[id]/page.tsx
      /orders/page.tsx
      /orders/[id]/page.tsx
      /settings/page.tsx
      /settings/chatbot/page.tsx (Ultimate only)
      /billing/page.tsx
      /billing/upgrade/page.tsx
    /super-admin/
      /page.tsx
      /stores/page.tsx
      /stores/[id]/page.tsx
      /payments/page.tsx

  /(store)                       Store pages ([slug].krenix.store)
    /page.tsx                    Store home
    /p/[slug]/page.tsx           Landing page
    /merci/page.tsx              Thank you page

/api
  /ai/landing-page/route.ts
  /ai/chatbot/route.ts
  /orders/route.ts
  /orders/[id]/route.ts
  /products/route.ts
  /products/[id]/route.ts
  /store/[slug]/route.ts
  /store/check-slug/route.ts
  /credits/use/route.ts
  /super-admin/confirm-payment/route.ts
  /super-admin/stores/[id]/route.ts

/components
  /ui/                           Shared atoms (Button, Input, Modal, Badge, etc.)
  /dashboard/                    Dashboard-specific components
  /onboarding/                   Onboarding wizard components
  /store/                        Customer-facing store components
  /chatbot/                      Chat widget
  /super-admin/                  Super admin components

/lib
  /supabase/
    /client.ts                   Browser Supabase client
    /server.ts                   Server Supabase client
    /admin.ts                    Service role client (API routes only)
  /claude.ts                     Claude API helper
  /gemini.ts                     Gemini API helper
  /subdomain.ts                  Slug extraction from hostname
  /themes.ts                     Theme configs
  /credits.ts                    Credit management
  /wilayas.ts                    Algeria wilayas list (58 wilayas)

/types
  /database.ts                   TypeScript types matching DB schema exactly
  /api.ts                        API request/response types

/middleware.ts                   Subdomain routing (DO NOT MODIFY without reading first)
```

---

## DATABASE SCHEMA

All SQL migrations are in `/database/` folder. Run them in order:
1. `001_schema.sql` — All tables
2. `002_rls.sql` — Row Level Security policies
3. `003_seed.sql` — Default themes data

Key tables:
- `stores` — One row per tenant. Contains plan, credits, settings.
- `products` — Belongs to store. Has images[], colors[], sizes[].
- `landing_pages` — AI-generated pages. Belongs to store + product.
- `orders` — Customer orders. Status flow: pending→confirmed→chez_livreur→en_livraison→livree|annulee|retournee
- `themes` — Available themes. Locked by tier_required field.
- `subscriptions` — Payment records. Manually confirmed by super admin.
- `chatbot_sessions` — Conversation history per session.
- `chatbot_daily_usage` — Daily message count per store for rate limiting.
- `credit_usage` — Log of every credit spent.
- `super_admins` — Only Issam. One row.

---

## DESIGN RULES

There are TWO distinct visual systems in this codebase. Use the right one for the surface you're editing.

### A) Dashboard (`/dashboard/*`) — "Éclat" light theme  ← the client dashboard
The client-facing dashboard was rebuilt to the light Éclat design. This is now the
source of truth for anything under `src/app/(platform)/dashboard/**` and
`src/components/dashboard/**`.

- **Tokens only — never hardcode dashboard colors.** All colors are `dash-*` design
  tokens defined in `src/app/globals.css` under `@theme` (OKLCH). Use the Tailwind
  classes, e.g. `bg-dash-surface`, `border-dash-border`, `text-dash-ink`,
  `text-dash-ink-soft`, `text-dash-ink-faint`, `bg-dash-surface-2`.
- Palette: page `bg-dash-page`, cards `bg-dash-surface` + `border-dash-border`
  (`rounded-[20px]`), primary accent `dash-accent` (sage green, hover
  `dash-accent-dark`), premium/plan accent `dash-gold`/`dash-gold-dark`.
- Semantic: `dash-success` / `dash-danger` / `dash-warning(-dark)` / `dash-info` /
  `dash-purple` / `dash-neutral`, each with a `-soft` background variant. Order-status
  chips use `ORDER_STATUS_DASH_COLORS`; lead chips use `LEAD_STATUS_DASH_COLORS`
  (both in `src/types/database.ts`) — NOT the legacy dark maps.
- Typography: headings use `dash-font-heading` (Bodoni Moda serif); body uses
  `dash-font-sans` (Manrope). Page titles are `dash-font-heading font-medium text-[28px] text-dash-ink`.
- Motion: Framer Motion primitives live in `src/lib/dashboard-motion.ts`
  (`fadeUp`, `staggerContainer`, `cardHover`, `useCountUp`, `useInViewOnce`). Reuse
  the shared UI atoms in `src/components/dashboard/ui/` (Card, StatTile, StatusBadge,
  PeriodToggle, AreaLineChart, DonutChart, LockedFeatureCard, ComingSoonPanel, PlanCard,
  DashboardLogo — the single logo placeholder to swap when the real logo lands).
- Locked features: use `<LockedFeatureCard title requiredPlan />`. Teasers for
  unbuilt features: `<ComingSoonPanel />` (e.g. AI forecast).
- Brand colors of third-party services stay literal (NOT tokenized): Yalidine `#C8201C`,
  WhatsApp `#25D366`, Facebook `#1877F2`, Maystro `#1B9BE2`, ZR `#111827`, etc.

### B) Store / public — legacy dark theme
Customer-facing store pages and the store-landing niche themes still use the original
dark aesthetic. Keep these as-is; do NOT migrate them to `dash-*`.

> NOTE: the **super-admin panel** and the **marketing home page** (`src/app/page.tsx`)
> were migrated to the Éclat light theme (dark sidebar + light content, same `dash-*`
> tokens as the dashboard). Treat them as system A now.

- Dark background #0A0A0F, cards #111118
- Primary accent Gold/amber #F59E0B, secondary Electric blue #3B82F6
- Glassmorphic cards: `bg-white/5 backdrop-blur-md border border-white/10`
- Store landing THEMES are per-niche and self-contained (see `lib/themes.ts` + theme
  templates); the theme preview swatches in the dashboard deliberately keep their own
  colors — they represent the store's appearance, not dashboard chrome.

### Shared rules (both systems)
- Mobile-first — all layouts tested at 375px first
- Smooth transitions: `transition-all` on interactive elements
- Empty states: always show an icon + message + CTA button, never blank
- Locked features: shown (not hidden) with a lock icon + upgrade badge
- Credits counter: always visible in the dashboard header

---

## UI LANGUAGE RULES

- All dashboard UI: French
- Error messages: French
- Empty states: French
- Store-facing pages: French (store owner can customize)
- Chatbot: French + Darja (handled by Gemini system prompt)
- Phone format: Algerian (0X XX XX XX XX — 10 digits)
- Wilaya: dropdown of all 58 Algerian wilayas — never free text
- Currency: always display as "DZD" or "DA"

---

## AI INTEGRATION

### Landing Page Generator (Claude API)
- Model: claude-sonnet-4-6
- Costs 5 credits per generation
- Check credits > 0 BEFORE calling the API
- Deduct credit atomically in the API route
- Output: JSON matching LandingPageContent type in /types/api.ts
- If credits = 0: return 402 status, show upgrade modal on client

### Chatbot (Gemini API)
- Model: gemini-2.5-flash-lite
- Only active if store.plan === 'ultimate' OR store.chatbot_daily_limit > 0
- Check daily limit BEFORE calling API
- Increment daily usage AFTER successful response
- If limit reached: return polite French message, do NOT call API
- If chatbot response contains ORDER_READY: prefix → parse JSON → create order

---

## PAYMENT FLOW

### How Krenix is actually sold (important for Super Admin design)
Sales happen OFF-PLATFORM via social media (Instagram, Facebook, WhatsApp).
The flow is: Ad → DM → Issam demos the platform → customer pays → Issam activates.
Algerians always verify the product before paying. A live demo link is essential.

### Payment Methods Accepted
- CIB (bank card)
- Edahabia (Algeria Post card)
- BaridiMob (Algeria Post mobile app — most common)
- Virement bancaire (bank transfer)
- Cash (in-person — rare)

### On-Platform Payment Request Flow
1. Customer selects plan on /dashboard/billing/upgrade
2. Sees payment instructions:
   - BaridiMob number: [Issam's number]
   - CIB/Edahabia details
   - Reference to include: their store slug
3. Customer makes payment manually
4. Uploads screenshot proof via file upload
5. Status shows "En attente de confirmation"
6. Issam sees pending payment in /super-admin/payments
7. Reviews proof → clicks "Confirmer" → store instantly upgrades
8. Customer gets confirmation message

### Demo Store
A special store at demo.krenix.store (slug: "demo") is pre-created with:
- Sample products
- Sample landing pages
- Active chatbot
- Sample orders in the dashboard (visible to Issam only)
This is what Issam sends to prospects via DM to close the sale.

---

## SUPER ADMIN

Only one super admin: the platform owner (Issam).
Protected by checking `super_admins` table on every /super-admin route.
Super admin can:
- Confirm/reject payments
- Manually change any store's plan, credits, chatbot limit
- Suspend/reactivate stores
- View all platform analytics

---

## DEVELOPMENT PHASES

### ✅ PHASE 1 (Current) — Core Platform
- [ ] Audit existing Le Mirage Textile codebase
- [ ] Run database migrations in Supabase
- [ ] Set up multi-tenant Supabase clients with RLS
- [ ] Build middleware.ts for subdomain routing
- [ ] Auth pages (login, register) with Supabase Auth
- [ ] Onboarding wizard (4 steps + complete screen)
- [ ] Dashboard layout with navigation
- [ ] Products CRUD (list, create, edit, delete)
- [ ] Orders management (list, filters, status update)
- [ ] Basic store subdomain pages (home + product listing)
- [ ] Themes system (3 Basic themes)

### 🔲 PHASE 2 — AI Features
- [ ] AI landing page generator (Claude API + credits)
- [ ] AI chatbot widget (Gemini API + rate limiting)
- [ ] Chatbot auto-order creation

### 🔲 PHASE 3 — Business
- [ ] Super admin panel
- [ ] Payment confirmation flow
- [ ] Subscription management
- [ ] Email notifications

### 🔲 PHASE 4 — Growth
- [ ] Platform landing page (krenix.store)
- [ ] Analytics dashboard
- [ ] Sur Mesure add-ons
- [ ] Performance optimization

---

## CRITICAL RULES — NEVER VIOLATE

1. NEVER delete customer data when a plan downgrades — only restrict access
2. NEVER bypass RLS with service role client on the browser side
3. NEVER hardcode API keys — always use environment variables
4. NEVER use localStorage or sessionStorage in components
5. NEVER show a blank/empty page — always have a loading state and empty state
6. NEVER create a form using HTML <form> tags in React — use onClick handlers
7. ALWAYS check plan/credits server-side before AI API calls
8. ALWAYS use the 58-wilaya dropdown — never free text for wilaya field
9. ALWAYS validate Algerian phone format before saving orders

---

## ENVIRONMENT VARIABLES

See `.env.example` for all required variables.
Never commit `.env.local` to git.

---

## WHEN YOU START EACH SESSION

1. Read this CLAUDE.md file completely
2. Read `dev-notes/Index.md` via the `obsidian` MCP server (vault: `landing-page-lucky2`) — it's a condensed log of prior sessions' work and decisions. Use it instead of re-deriving project state from scratch.
3. Run: `ls -la` to see current folder structure
4. Check which Phase 1 tasks are done vs pending
5. Pick the next uncompleted task
6. Announce what you're about to do before doing it
7. Complete it fully before moving to the next task

---

## OBSIDIAN DEV NOTES (persistent working memory)

This project's root is also an Obsidian vault (`landing-page-lucky2`), connected via the `obsidian` MCP server. Notes live in the gitignored `dev-notes/` folder and exist to reduce how much conversation history/context is needed to resume work.

- **`dev-notes/Index.md`** — the entry point. Read it at session start (see above). Append a short entry (1-3 lines: what changed, why, key decisions) after finishing each meaningful task, newest-first under the `## Log` heading.
- For anything too large for a 1-3 line entry (a design decision with tradeoffs, a multi-step migration plan, a debugging saga worth remembering), create a separate note in `dev-notes/` and link it from the Index entry instead of dumping detail into the index.
- Keep entries factual and condensed — this is memory to resume work faster, not a changelog for humans. Don't restate anything derivable from `git log` or the code itself.
- `dev-notes/` is local-only (gitignored) — never rely on it being present on another machine or in CI.
