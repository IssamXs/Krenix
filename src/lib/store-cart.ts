// ============================================================
// Pure cart cookie logic — no DOM access here (see store-cart.test.ts,
// which runs under vitest's node environment, per vitest.config.ts).
// CartProvider.tsx (a future task) is the only place that touches
// `document.cookie`, wrapping these functions.
//
// Cookie-based, not localStorage/sessionStorage — CLAUDE.md forbids both
// for components on this project. Mirrors the existing cookie-mirroring
// pattern in src/lib/active-store.ts (setActiveStoreId).
// ============================================================

export interface CartItem {
  productId: string
  name: string
  image: string | null
  unitPrice: number
  color: string | null
  size: string | null
  quantity: number
  // Path of the page the item was added from (e.g. "/p/couvre-matelas").
  // Used to send a single-item cart straight back to that product's own
  // existing order flow instead of building a second checkout UI for it.
  pageUrl: string
}

type CartLine = { productId: string; color: string | null; size: string | null }

export function cartCookieName(storeSlug: string): string {
  return `krenix_cart_${storeSlug}`
}

function isValidCartItem(x: unknown): x is CartItem {
  if (!x || typeof x !== 'object') return false
  const i = x as Record<string, unknown>
  return (
    typeof i.productId === 'string' &&
    typeof i.name === 'string' &&
    typeof i.unitPrice === 'number' &&
    typeof i.quantity === 'number' &&
    typeof i.pageUrl === 'string'
  )
}

export function parseCartCookie(cookieString: string, storeSlug: string): CartItem[] {
  const name = cartCookieName(storeSlug)
  const match = cookieString.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  if (!match) return []
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1]))
    return Array.isArray(parsed) ? parsed.filter(isValidCartItem) : []
  } catch {
    return []
  }
}

// 7-day expiry — long enough to survive a real browsing session, short
// enough that an abandoned cart doesn't linger forever referencing stale
// prices (the server always re-prices from the live product row anyway, but
// a fresh cart is still a better experience than a week-old one).
export function serializeCartCookie(storeSlug: string, items: CartItem[]): string {
  return `${cartCookieName(storeSlug)}=${encodeURIComponent(JSON.stringify(items))}; path=/; max-age=604800; SameSite=Lax`
}

function sameCartLine(a: CartLine, b: CartLine): boolean {
  return a.productId === b.productId && a.color === b.color && a.size === b.size
}

export function addCartItem(items: CartItem[], item: CartItem): CartItem[] {
  const existing = items.find(i => sameCartLine(i, item))
  if (!existing) return [...items, item]
  return items.map(i => (sameCartLine(i, item) ? { ...i, quantity: i.quantity + item.quantity } : i))
}

export function removeCartItem(items: CartItem[], line: CartLine): CartItem[] {
  return items.filter(i => !sameCartLine(i, line))
}

export function updateCartItemQuantity(items: CartItem[], line: CartLine, quantity: number): CartItem[] {
  if (quantity < 1) return removeCartItem(items, line)
  return items.map(i => (sameCartLine(i, line) ? { ...i, quantity } : i))
}

export function cartTotals(items: CartItem[]): { totalItems: number; totalPrice: number } {
  return {
    totalItems: items.reduce((sum, i) => sum + i.quantity, 0),
    totalPrice: items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
  }
}
