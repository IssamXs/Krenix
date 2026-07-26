'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Client-side data cache for the dashboard. Before this, every page
// (Overview, Products, Orders, ...) did its own useEffect + Supabase fetch on
// every mount — navigating away and back within seconds refetched everything
// from scratch. staleTime keeps a recently-fetched screen instant on revisit
// while still refreshing in the background; mutations invalidate the
// specific query keys they affect (see each page's queryClient.invalidateQueries).
export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,       // dashboard data — fresh enough for 30s without refetching
        gcTime: 5 * 60_000,      // keep cached data around for quick back/forward nav
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }))

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
