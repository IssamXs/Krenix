'use client'

import { useEffect, useRef } from 'react'
import { trackViewContent } from '@/lib/pixel-events'

/**
 * Fires Meta/TikTok ViewContent once on mount for a specific product. Renders
 * nothing. Used on landing pages and product detail pages so ad campaigns get
 * a proper mid-funnel signal (visitor viewed this specific SKU).
 *
 * When `storeId` is provided, the event is also sent server-side via CAPI
 * for deduplication and improved Event Match Quality.
 */
export default function ViewContentTracker({
  productId,
  productName,
  price,
  storeId,
}: {
  productId: string
  productName: string
  price: number
  storeId?: string
}) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    trackViewContent(
      { id: productId, name: productName, price },
      storeId ? { storeId } : undefined,
    )
  }, [productId, productName, price, storeId])
  return null
}
