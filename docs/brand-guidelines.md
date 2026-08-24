# Krenix Brand Guidelines

> Source of truth for the Krenix visual identity. Updated 2026-08-16 when the
> mark moved from the soft watercolor phoenix (`krenix-phoenix.png`, teal
> flame silhouette) to the circuit-phoenix artwork supplied by the owner
> (`new pheonix logo.jpeg`).

## Quick Reference

| Token | Name | Hex |
|---|---|---|
| Primary | Krenix Mint | `#5AFFD6` |
| Primary (deep) | Signal Teal | `#159B94` |
| Secondary | Circuit Blue | `#0E3039` |
| Background | Void Navy | `#08121C` |
| Text-on-light (wordmark) | Deep Teal Ink | `#0F4C4A` |

## Brand Concept

**Name logic:** Krenix → phoe**NIX**. The mark is a phoenix rising — a
merchant going from nothing to a thriving store, matching the platform's
core promise (`Votre boutique. En pilote automatique.`).

**Direction:** "Circuit Phoenix" — the bird's wings and body are drawn as
glowing PCB traces/circuitry rather than feathers, tying the "rising from
ash" phoenix myth directly to the platform's AI/automation positioning.
Replaces the earlier soft watercolor-flame phoenix. Dark, glowing, technical
— not gold, not a generic letter-mark (both directions were explicitly
rejected by the owner in earlier sessions, see `dev-notes/`).

**Mood keywords:** technical, automated, glowing, rising, trustworthy,
Algerian-market-first.

## Color Palette

- **Primary — Krenix Mint** `#5AFFD6`: the brightest highlight color in the
  phoenix's glow (eye, wingtip cores). Use for the wordmark's brightest
  gradient stop, active/hover glow states, key accents on dark surfaces.
- **Primary (deep) — Signal Teal** `#159B94`: the phoenix's main line color.
  Use as the primary brand accent in UI on dark surfaces (store/public dark
  theme, marketing dark sections) — buttons, links, active states.
- **Secondary — Circuit Blue** `#0E3039`: cooler blue-teal from the wing
  shadows. Use for secondary accents, borders, and gradients paired with the
  primary teal.
- **Background — Void Navy** `#08121C`: the mark's native background. Already
  close to the existing store/public dark theme background (`#0A0A0F`) — no
  change needed there, they read as the same "space."
- **Text-on-light — Deep Teal Ink** `#0F4C4A`: used for the "KRENIX" wordmark
  text when rendered on light surfaces (Éclat dashboard chrome, auth pages,
  pricing, super-admin). Dark enough for contrast, still legibly teal.

**Do not touch:** the dashboard's Éclat light-theme tokens (`dash-*` in
`src/app/globals.css`, sage-green `dash-accent`) are a separate, deliberately
governed system per `CLAUDE.md` and are out of scope for this identity pass
unless explicitly requested.

## Typography

- **Wordmark / display lockups:** `Orbitron` (700/900), heavy tracking
  (`letter-spacing: 0.4-0.6em` relative). Used only in the rendered wordmark
  asset (`krenix-wordmark-v2.png`) and any future hero/marketing lockups —
  not a UI body font.
- **Product UI:** unchanged — `dash-font-heading` (Fraunces) for dashboard
  headings, `dash-font-sans` (Plus Jakarta Sans) for body, per existing
  `CLAUDE.md` rules.

## Logo Assets

All in `public/brand/`:

| File | Use |
|---|---|
| `krenix-mark-v2.png` | Primary mark. Feathered radial edge (fades to transparent) so it drops cleanly onto both the dark dashboard sidebar and light Éclat chrome without a visible box. 512×512. |
| `krenix-wordmark-v2.png` | Standalone glow "KRENIX" wordmark (Orbitron, mint→teal gradient, transparent background). For dark hero/marketing contexts only — not used in-app yet. |
| `krenix-cover.png` | OG/Twitter social share image, 1640×624. Wired into `src/app/layout.tsx` metadata. |
| `src/app/icon.png`, `src/app/apple-icon.png` | Browser tab favicon / iOS home-screen icon. Tighter head-only crop for legibility at small sizes. |

**Usage rule:** the mark is a single fixed asset (no recoloring, no
white-label swap logic) — same convention as before. White-label stores
still use their own uploaded `logoUrl`.

## Logo Component Wiring

- `src/components/ui/KrenixLogo.tsx` — mark + live "KRENIX" text, used on
  light platform pages (auth, pricing, privacy, terms, onboarding,
  super-admin).
- `src/components/dashboard/ui/DashboardLogo.tsx` — mark only, dashboard
  sidebar (dark).
- `src/app/page.tsx` — local `Phoenix` component, homepage nav/footer/CTA.

## Voice

Unchanged from existing product copy: French UI copy, direct and concrete
(feature bullets over adjectives), Algeria-specific proof points (wilaya
names, DZD pricing, BaridiMob). No changes made in this pass — flagged here
so a future voice-framework pass has a place to land.

## Open Items

- No AI credits were available this session (Higgsfield balance: 0), so the
  mark was produced by locally cropping/feathering the owner-supplied
  artwork rather than a clean AI background-removal segmentation. If a true
  transparent cutout (phoenix silhouette only, no background circuitry) is
  wanted later, redo with `remove_background` once credits are available.
- `krenix-wordmark-v2.png` is not wired into any component yet — current
  components render "KRENIX" as live text for flexibility. Swap in the glow
  asset only in confirmed-dark contexts if a stronger neon treatment is
  wanted.
- Old assets (`krenix-logo.png`, `krenix-mark.png`, `krenix-phoenix.png`,
  `krenix-profile.png`, `krenix-wordmark.png`) are unreferenced but still on
  disk in `public/brand/` — delete manually when convenient (a delete was
  blocked by this session's permission classifier).
