import { describe, it, expect } from 'vitest'
import { computeOfferPrice, OFFER_PRESETS } from './offers'

describe('OFFER_PRESETS', () => {
  it('has exactly 10 presets with unique ids', () => {
    expect(OFFER_PRESETS).toHaveLength(10)
    expect(new Set(OFFER_PRESETS.map(p => p.id)).size).toBe(10)
  })
})

describe('computeOfferPrice', () => {
  it('returns full price with no offer', () => {
    expect(computeOfferPrice(1000, 3, null, null)).toEqual({ payableQty: 3, freeQty: 0, totalPrice: 3000 })
  })

  describe('buy_x_get_y_free', () => {
    it('charges full price below the threshold', () => {
      expect(computeOfferPrice(1000, 2, 'buy_x_get_y_free', { buyQty: 2, freeQty: 1 }))
        .toEqual({ payableQty: 2, freeQty: 0, totalPrice: 2000 })
    })
    it('applies one free unit per complete group', () => {
      expect(computeOfferPrice(1000, 3, 'buy_x_get_y_free', { buyQty: 2, freeQty: 1 }))
        .toEqual({ payableQty: 2, freeQty: 1, totalPrice: 2000 })
    })
    it('applies two free units for two complete groups', () => {
      expect(computeOfferPrice(1000, 6, 'buy_x_get_y_free', { buyQty: 2, freeQty: 1 }))
        .toEqual({ payableQty: 4, freeQty: 2, totalPrice: 4000 })
    })
    it('does not apply a free unit to a partial trailing group', () => {
      expect(computeOfferPrice(1000, 4, 'buy_x_get_y_free', { buyQty: 2, freeQty: 1 }))
        .toEqual({ payableQty: 3, freeQty: 1, totalPrice: 3000 })
    })
  })

  describe('buy_x_get_percent_off', () => {
    it('charges full price below the threshold', () => {
      expect(computeOfferPrice(1000, 1, 'buy_x_get_percent_off', { buyQty: 2, percentOff: 20 }))
        .toEqual({ payableQty: 1, freeQty: 0, totalPrice: 1000 })
    })
    it('applies the discount to the whole order at the threshold', () => {
      expect(computeOfferPrice(1000, 2, 'buy_x_get_percent_off', { buyQty: 2, percentOff: 20 }))
        .toEqual({ payableQty: 2, freeQty: 0, totalPrice: 1600 })
    })
  })

  describe('nth_item_percent_off', () => {
    it('discounts every nth unit', () => {
      expect(computeOfferPrice(1000, 4, 'nth_item_percent_off', { nth: 2, percentOff: 50 }))
        .toEqual({ payableQty: 4, freeQty: 0, totalPrice: 3000 })
    })
  })

  describe('bundle_fixed_price', () => {
    it('prices complete bundles flat and remainder at unit price', () => {
      expect(computeOfferPrice(1000, 5, 'bundle_fixed_price', { bundleQty: 2, bundlePrice: 1800 }))
        .toEqual({ payableQty: 5, freeQty: 0, totalPrice: 4600 })
    })
  })

  describe('flat_percent_off', () => {
    it('applies regardless of quantity', () => {
      expect(computeOfferPrice(1000, 1, 'flat_percent_off', { percentOff: 15 }))
        .toEqual({ payableQty: 1, freeQty: 0, totalPrice: 850 })
    })
  })

  describe('tiered_discount', () => {
    it('applies no discount below the lowest tier', () => {
      expect(computeOfferPrice(1000, 2, 'tiered_discount', { tiers: [{ minQty: 3, percentOff: 10 }, { minQty: 5, percentOff: 20 }] }))
        .toEqual({ payableQty: 2, freeQty: 0, totalPrice: 2000 })
    })
    it('applies the highest qualifying tier', () => {
      expect(computeOfferPrice(1000, 5, 'tiered_discount', { tiers: [{ minQty: 3, percentOff: 10 }, { minQty: 5, percentOff: 20 }] }))
        .toEqual({ payableQty: 5, freeQty: 0, totalPrice: 4000 })
    })
    it('does not overshoot to a higher tier than qualified', () => {
      expect(computeOfferPrice(1000, 4, 'tiered_discount', { tiers: [{ minQty: 3, percentOff: 10 }, { minQty: 5, percentOff: 20 }] }))
        .toEqual({ payableQty: 4, freeQty: 0, totalPrice: 3600 })
    })
  })
})
