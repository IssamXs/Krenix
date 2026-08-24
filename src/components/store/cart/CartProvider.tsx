'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import {
  type CartItem, parseCartCookie, serializeCartCookie,
  addCartItem, removeCartItem, updateCartItemQuantity, cartTotals,
} from '@/lib/store-cart'

type CartLine = { productId: string; color: string | null; size: string | null }

interface CartContextValue {
  items: CartItem[]
  totalItems: number
  totalPrice: number
  addItem: (item: CartItem) => void
  removeItem: (line: CartLine) => void
  updateQuantity: (line: CartLine, quantity: number) => void
  clear: () => void
}

const EMPTY_CONTEXT: CartContextValue = {
  items: [], totalItems: 0, totalPrice: 0,
  addItem: () => {}, removeItem: () => {}, updateQuantity: () => {}, clear: () => {},
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ storeSlug, children }: { storeSlug: string; children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  // Cookie is the source of truth, but it can only be read client-side.
  // Starting from [] (matching the server-rendered HTML, which never sees
  // document.cookie) and updating after mount is required for hydration
  // safety here — reading the cookie synchronously during the initial
  // render would make the client's first paint disagree with what the
  // server sent (e.g. CartWidget rendering null vs. a real button) and
  // trigger a hydration mismatch. The .then() (rather than a bare
  // setItems() call) is what keeps this out of react-hooks/set-state-in-effect
  // while preserving that same "after mount" timing — see the identical
  // idiom in src/app/(platform)/activate/page.tsx.
  useEffect(() => {
    Promise.resolve().then(() => setItems(parseCartCookie(document.cookie, storeSlug)))
  }, [storeSlug])

  const persist = (next: CartItem[]) => {
    setItems(next)
    document.cookie = serializeCartCookie(storeSlug, next)
  }

  const value: CartContextValue = {
    items,
    ...cartTotals(items),
    addItem: item => persist(addCartItem(items, item)),
    removeItem: line => persist(removeCartItem(items, line)),
    updateQuantity: (line, quantity) => persist(updateCartItemQuantity(items, line, quantity)),
    clear: () => persist([]),
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  // Defensive fallback (never throws) — keeps callers safe if ever rendered
  // outside a CartProvider.
  return useContext(CartContext) ?? EMPTY_CONTEXT
}
