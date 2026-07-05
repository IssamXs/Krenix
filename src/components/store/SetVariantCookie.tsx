'use client'

import { useEffect } from 'react'

/**
 * Persists the assigned A/B variant in a cookie so the same visitor keeps
 * seeing the same version (sticky) and the order form can tag their order.
 */
export default function SetVariantCookie({ pageId, variant }: { pageId: string; variant: 'A' | 'B' }) {
  useEffect(() => {
    document.cookie = `lpv_${pageId}=${variant}; path=/; max-age=2592000; samesite=lax`
  }, [pageId, variant])
  return null
}
