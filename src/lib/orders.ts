import type { OrderStatus } from '@/types/database'

// Statuses at which an order's quantity has already been deducted from
// product stock (see the status-change stock adjustment in
// dashboard/orders/page.tsx and the edit-time reconciliation in
// api/orders/[id]/route.ts). Shared so both places can never drift apart.
export const STOCK_DEDUCTED_STATUSES = new Set<OrderStatus>([
  'confirmed', 'chez_livreur', 'en_livraison', 'livree',
])
