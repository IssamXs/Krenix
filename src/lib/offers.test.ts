import { describe, it, expect } from 'vitest'
import { computeOfferPrice, formatOfferLabel, OFFER_PRESETS } from './offers'

describe('OFFER_PRESETS', () => {
  it('has exactly 10 presets with unique ids', () => {
    expect(OFFER_PRESETS).toHaveLength(10)
    expect(new Set(OFFER_PRESETS.map(p => p.id)).size).toBe(10)
  })
})

describe('formatOfferLabel', () => {
  it('reflects the live config, not frozen preset text', () => {
    // Regression test: editing a preset's numbers (e.g. 20% -> 15%) must
    // change the generated label, not just the price calculation.
    expect(formatOfferLabel('buy_x_get_percent_off', { buyQty: 2, percentOff: 20 }))
      .toBe('-20% dès 2 articles achetés')
    expect(formatOfferLabel('buy_x_get_percent_off', { buyQty: 2, percentOff: 15 }))
      .toBe('-15% dès 2 articles achetés')
  })

  it('formats buy_x_get_y_free', () => {
    expect(formatOfferLabel('buy_x_get_y_free', { buyQty: 2, freeQty: 1 })).toBe('Achetez 2, obtenez 1 gratuit')
    expect(formatOfferLabel('buy_x_get_y_free', { buyQty: 3, freeQty: 2 })).toBe('Achetez 3, obtenez 2 gratuits')
  })

  it('formats nth_item_percent_off', () => {
    expect(formatOfferLabel('nth_item_percent_off', { nth: 2, percentOff: 50 })).toBe('2ème article à -50%')
  })

  it('formats bundle_fixed_price', () => {
    expect(formatOfferLabel('bundle_fixed_price', { bundleQty: 2, bundlePrice: 1800 })).toBe('Pack de 2 à 1 800 DA')
  })

  it('formats flat_percent_off', () => {
    expect(formatOfferLabel('flat_percent_off', { percentOff: 15 })).toBe('-15% sur cet article')
  })

  it('formats tiered_discount', () => {
    expect(formatOfferLabel('tiered_discount', { tiers: [{ minQty: 3, percentOff: 10 }, { minQty: 5, percentOff: 20 }] }))
      .toBe('Réduction par palier (3+ : -10%, 5+ : -20%)')
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

  describe('clamping and null-guard regressions (mirrors SQL compute_offer_total)', () => {
    it('clamps percentOff above 100 to 100 for buy_x_get_percent_off', () => {
      expect(computeOfferPrice(1000, 2, 'buy_x_get_percent_off', { buyQty: 2, percentOff: 150 }))
        .toEqual({ payableQty: 2, freeQty: 0, totalPrice: 0 })
    })
    it('clamps negative percentOff to 0 for buy_x_get_percent_off', () => {
      expect(computeOfferPrice(1000, 2, 'buy_x_get_percent_off', { buyQty: 2, percentOff: -10 }))
        .toEqual({ payableQty: 2, freeQty: 0, totalPrice: 2000 })
    })
    it('clamps percentOff above 100 to 100 for nth_item_percent_off', () => {
      expect(computeOfferPrice(1000, 4, 'nth_item_percent_off', { nth: 2, percentOff: 150 }))
        .toEqual({ payableQty: 4, freeQty: 0, totalPrice: 2000 })
    })
    it('clamps percentOff above 100 to 100 for flat_percent_off', () => {
      expect(computeOfferPrice(1000, 1, 'flat_percent_off', { percentOff: 150 }))
        .toEqual({ payableQty: 1, freeQty: 0, totalPrice: 0 })
    })
    it('clamps negative percentOff to 0 for flat_percent_off', () => {
      expect(computeOfferPrice(1000, 1, 'flat_percent_off', { percentOff: -10 }))
        .toEqual({ payableQty: 1, freeQty: 0, totalPrice: 1000 })
    })
    it('returns the fallback when flat_percent_off is missing percentOff', () => {
      expect(computeOfferPrice(1000, 3, 'flat_percent_off', {} as any))
        .toEqual({ payableQty: 3, freeQty: 0, totalPrice: 3000 })
    })
    it('clamps a tier percentOff above 100 to 100', () => {
      expect(computeOfferPrice(1000, 5, 'tiered_discount', { tiers: [{ minQty: 5, percentOff: 150 }] }))
        .toEqual({ payableQty: 5, freeQty: 0, totalPrice: 0 })
    })
    it('clamps a negative bundlePrice to 0', () => {
      expect(computeOfferPrice(1000, 2, 'bundle_fixed_price', { bundleQty: 2, bundlePrice: -500 }))
        .toEqual({ payableQty: 2, freeQty: 0, totalPrice: 0 })
    })
  })
})
