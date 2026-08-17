// Offer pricing lives in exactly two places: this file (client-side preview
// used by OrderFormFields.tsx) and compute_offer_total() in
// Database/057_product_offers.sql (server-side enforcement in
// validate_order_insert). They MUST compute identical results for identical
// inputs — if you change a formula here, mirror the change in the SQL
// function in the same commit.

export type OfferType =
  | 'buy_x_get_y_free'
  | 'buy_x_get_percent_off'
  | 'nth_item_percent_off'
  | 'bundle_fixed_price'
  | 'flat_percent_off'
  | 'tiered_discount'

export type OfferConfig =
  | { buyQty: number; freeQty: number }
  | { buyQty: number; percentOff: number }
  | { nth: number; percentOff: number }
  | { bundleQty: number; bundlePrice: number }
  | { percentOff: number }
  | { tiers: { minQty: number; percentOff: number }[] }

export interface OfferPreset {
  id: string
  offerType: OfferType
  label: string
  defaultConfig: OfferConfig
}

export const OFFER_PRESETS: OfferPreset[] = [
  { id: 'buy2get1', offerType: 'buy_x_get_y_free', label: 'Achetez 2, obtenez 1 gratuit', defaultConfig: { buyQty: 2, freeQty: 1 } },
  { id: 'buy3get1', offerType: 'buy_x_get_y_free', label: 'Achetez 3, obtenez 1 gratuit', defaultConfig: { buyQty: 3, freeQty: 1 } },
  { id: 'nth2half', offerType: 'nth_item_percent_off', label: '2ème article à -50%', defaultConfig: { nth: 2, percentOff: 50 } },
  { id: 'buy2pct20', offerType: 'buy_x_get_percent_off', label: '-20% dès 2 articles achetés', defaultConfig: { buyQty: 2, percentOff: 20 } },
  { id: 'buy3pct30', offerType: 'buy_x_get_percent_off', label: '-30% dès 3 articles achetés', defaultConfig: { buyQty: 3, percentOff: 30 } },
  { id: 'bundle2', offerType: 'bundle_fixed_price', label: 'Pack de 2 à prix fixe', defaultConfig: { bundleQty: 2, bundlePrice: 0 } },
  { id: 'bundle3', offerType: 'bundle_fixed_price', label: 'Pack de 3 à prix fixe', defaultConfig: { bundleQty: 3, bundlePrice: 0 } },
  { id: 'flat15', offerType: 'flat_percent_off', label: '-15% sur cet article', defaultConfig: { percentOff: 15 } },
  { id: 'flat25', offerType: 'flat_percent_off', label: '-25% sur cet article', defaultConfig: { percentOff: 25 } },
  {
    id: 'tiered', offerType: 'tiered_discount', label: 'Réduction par palier (3+ : -10%, 5+ : -20%)',
    defaultConfig: { tiers: [{ minQty: 3, percentOff: 10 }, { minQty: 5, percentOff: 20 }] },
  },
]

export interface OfferComputation {
  payableQty: number
  freeQty: number
  totalPrice: number
}

export function computeOfferPrice(
  unitPrice: number,
  quantity: number,
  offerType: OfferType | null | undefined,
  offerConfig: OfferConfig | null | undefined,
): OfferComputation {
  const fallback: OfferComputation = { payableQty: quantity, freeQty: 0, totalPrice: unitPrice * quantity }
  if (!offerType || !offerConfig || quantity < 1) return fallback

  switch (offerType) {
    case 'buy_x_get_y_free': {
      const { buyQty, freeQty } = offerConfig as { buyQty: number; freeQty: number }
      if (!buyQty || !freeQty || buyQty < 1 || freeQty < 1) return fallback
      const groupSize = buyQty + freeQty
      const groups = Math.floor(quantity / groupSize)
      const free = groups * freeQty
      const payable = quantity - free
      return { payableQty: payable, freeQty: free, totalPrice: payable * unitPrice }
    }
    case 'buy_x_get_percent_off': {
      const { buyQty, percentOff } = offerConfig as { buyQty: number; percentOff: number }
      if (!buyQty || quantity < buyQty) return fallback
      const clamped = Math.max(0, Math.min(100, percentOff))
      return { payableQty: quantity, freeQty: 0, totalPrice: Math.round(unitPrice * quantity * (1 - clamped / 100)) }
    }
    case 'nth_item_percent_off': {
      const { nth, percentOff } = offerConfig as { nth: number; percentOff: number }
      if (!nth || nth < 2) return fallback
      const clamped = Math.max(0, Math.min(100, percentOff))
      const discountedUnits = Math.floor(quantity / nth)
      const fullUnits = quantity - discountedUnits
      const total = fullUnits * unitPrice + discountedUnits * unitPrice * (1 - clamped / 100)
      return { payableQty: quantity, freeQty: 0, totalPrice: Math.round(total) }
    }
    case 'bundle_fixed_price': {
      const { bundleQty, bundlePrice } = offerConfig as { bundleQty: number; bundlePrice: number }
      if (!bundleQty || bundleQty < 1) return fallback
      const clampedBundlePrice = Math.max(0, bundlePrice)
      const groups = Math.floor(quantity / bundleQty)
      const remainder = quantity - groups * bundleQty
      const total = groups * clampedBundlePrice + remainder * unitPrice
      return { payableQty: quantity, freeQty: 0, totalPrice: Math.round(total) }
    }
    case 'flat_percent_off': {
      const { percentOff } = offerConfig as { percentOff: number }
      if (percentOff === null || percentOff === undefined) return fallback
      const clamped = Math.max(0, Math.min(100, percentOff))
      return { payableQty: quantity, freeQty: 0, totalPrice: Math.round(unitPrice * quantity * (1 - clamped / 100)) }
    }
    case 'tiered_discount': {
      const { tiers } = offerConfig as { tiers: { minQty: number; percentOff: number }[] }
      const applicable = tiers
        .filter(t => quantity >= t.minQty)
        .sort((a, b) => b.minQty - a.minQty)[0]
      if (!applicable) return fallback
      const clamped = Math.max(0, Math.min(100, applicable.percentOff))
      return { payableQty: quantity, freeQty: 0, totalPrice: Math.round(unitPrice * quantity * (1 - clamped / 100)) }
    }
    default:
      return fallback
  }
}
