import type { Store, StoreSettings } from '@/types/database'

export type StoreLocale = 'fr' | 'ar'

/**
 * Storefront/landing/order-flow language for a store.
 * Falls back to 'fr' when the field is absent (every legacy store).
 */
export function getStoreLocale(
  store: Pick<Store, 'settings'> | { settings?: Partial<StoreSettings> | null }
): StoreLocale {
  return store?.settings?.storeLanguage === 'ar' ? 'ar' : 'fr'
}

/**
 * True when the given store should render right-to-left.
 * Alias for `getStoreLocale(store) === 'ar'` — reads more naturally at call sites.
 */
export function isStoreRTL(
  store: Pick<Store, 'settings'> | { settings?: Partial<StoreSettings> | null }
): boolean {
  return getStoreLocale(store) === 'ar'
}
