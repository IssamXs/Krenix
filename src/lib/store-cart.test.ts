// src/lib/store-cart.test.ts
import { describe, it, expect } from 'vitest'
import {
  cartCookieName, parseCartCookie, serializeCartCookie,
  addCartItem, removeCartItem, updateCartItemQuantity, cartTotals,
  type CartItem,
} from './store-cart'

const item = (over: Partial<CartItem> = {}): CartItem => ({
  productId: 'prod-1', name: 'Couvre matelas', image: null, unitPrice: 2500,
  color: null, size: null, quantity: 1, pageUrl: '/p/couvre-matelas', ...over,
})

describe('cartCookieName', () => {
  it('namespaces the cookie by store slug', () => {
    expect(cartCookieName('le-mirage')).toBe('krenix_cart_le-mirage')
  })
})

describe('parseCartCookie', () => {
  it('returns an empty array when the cookie is absent', () => {
    expect(parseCartCookie('other_cookie=1', 'le-mirage')).toEqual([])
  })

  it('parses a previously-serialized cart', () => {
    const items = [item()]
    const cookieString = serializeCartCookie('le-mirage', items).split(';')[0]
    expect(parseCartCookie(cookieString, 'le-mirage')).toEqual(items)
  })

  it('ignores malformed cookie content instead of throwing', () => {
    expect(parseCartCookie('krenix_cart_le-mirage=not-json', 'le-mirage')).toEqual([])
  })
})

describe('addCartItem', () => {
  it('adds a new line for a product/variant combination not already in the cart', () => {
    const result = addCartItem([], item())
    expect(result).toHaveLength(1)
  })

  it('merges quantities when the same product+color+size is added again', () => {
    const result = addCartItem([item({ quantity: 2 })], item({ quantity: 3 }))
    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(5)
  })

  it('keeps separate lines for the same product in different colors', () => {
    const result = addCartItem([item({ color: 'Bleu' })], item({ color: 'Rouge' }))
    expect(result).toHaveLength(2)
  })
})

describe('removeCartItem', () => {
  it('removes only the matching product+variant line', () => {
    const items = [item({ color: 'Bleu' }), item({ color: 'Rouge' })]
    const result = removeCartItem(items, { productId: 'prod-1', color: 'Bleu', size: null })
    expect(result).toEqual([item({ color: 'Rouge' })])
  })
})

describe('updateCartItemQuantity', () => {
  it('updates the quantity of the matching line', () => {
    const result = updateCartItemQuantity([item()], { productId: 'prod-1', color: null, size: null }, 4)
    expect(result[0].quantity).toBe(4)
  })

  it('removes the line when the quantity drops below 1', () => {
    const result = updateCartItemQuantity([item()], { productId: 'prod-1', color: null, size: null }, 0)
    expect(result).toEqual([])
  })
})

describe('cartTotals', () => {
  it('sums item count and price across every line', () => {
    const totals = cartTotals([item({ quantity: 2, unitPrice: 1000 }), item({ productId: 'prod-2', quantity: 1, unitPrice: 500 })])
    expect(totals).toEqual({ totalItems: 3, totalPrice: 2500 })
  })
})
