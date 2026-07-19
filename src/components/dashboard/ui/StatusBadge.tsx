import { ORDER_STATUS_DASH_COLORS, ORDER_STATUS_LABELS, type OrderStatus } from '@/types/database'

// The one status pill every rebuilt dashboard page uses — sources its colors
// from ORDER_STATUS_DASH_COLORS (types/database.ts) instead of each page
// inventing its own map, which is how the old dashboard ended up with three
// mutually-inconsistent status-color schemes.
export default function StatusBadge({ status, withDot = false }: { status: OrderStatus; withDot?: boolean }) {
  const c = ORDER_STATUS_DASH_COLORS[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1 rounded-full w-fit ${c.bg} ${c.fg}`}>
      {withDot && <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />}
      {ORDER_STATUS_LABELS[status]}
    </span>
  )
}
