import { ULTIMATE_PLANS, type Plan } from '@/types/database'

export type BadgeId =
  | 'winner' | 'bestseller' | 'promo' | 'new' | 'limited_edition'
  | 'staff_pick' | 'trending' | 'low_stock' | 'exclusive' | 'expert_choice'

export interface BadgeDef {
  id: BadgeId
  label: string
  emoji: string | null
  color: string
}

// Order is also display-priority order — used to cap small cards to the top N.
export const BADGE_CATALOG: BadgeDef[] = [
  { id: 'winner', label: 'Winner', emoji: '🏆', color: '#D4AF37' },
  { id: 'bestseller', label: 'Meilleure vente', emoji: '🔥', color: '#DC2626' },
  { id: 'promo', label: 'En promo', emoji: null, color: '#E11D48' },
  { id: 'new', label: 'Nouveau', emoji: '✨', color: '#2563EB' },
  { id: 'limited_edition', label: 'Édition limitée', emoji: null, color: '#7C3AED' },
  { id: 'staff_pick', label: 'Coup de cœur', emoji: '❤️', color: '#DB2777' },
  { id: 'trending', label: 'Tendance', emoji: '📈', color: '#EA580C' },
  { id: 'low_stock', label: 'Stock limité', emoji: '⚡', color: '#D97706' },
  { id: 'exclusive', label: 'Exclusif', emoji: '💎', color: '#4F46E5' },
  { id: 'expert_choice', label: 'Choix des experts', emoji: '✅', color: '#16A34A' },
]

export function canUseBadges(plan: Plan): boolean {
  return ULTIMATE_PLANS.includes(plan)
}

// Resolves raw badge ids (unordered, possibly containing unknown/stale ids)
// into catalog defs, in catalog priority order. `max` caps the result for
// small grid cards; omit it to return every matched badge.
export function getDisplayBadges(badges: string[] | null | undefined, max?: number): BadgeDef[] {
  if (!badges || badges.length === 0) return []
  const set = new Set(badges)
  const ordered = BADGE_CATALOG.filter(b => set.has(b.id))
  return typeof max === 'number' ? ordered.slice(0, max) : ordered
}

export function formatBadgeLabel(badge: BadgeDef, showEmojis: boolean): string {
  return showEmojis && badge.emoji ? `${badge.emoji} ${badge.label}` : badge.label
}
