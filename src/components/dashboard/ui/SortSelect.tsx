'use client'

import { ArrowUpDown } from 'lucide-react'
import { SORT_OPTIONS, type SortValue } from '@/lib/sort'

export default function SortSelect({
  value, onChange, className = '',
}: { value: SortValue; onChange: (v: SortValue) => void; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <ArrowUpDown size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dash-ink-faint pointer-events-none" />
      <select
        value={value}
        onChange={e => onChange(e.target.value as SortValue)}
        className="appearance-none pl-9 pr-8 py-2.5 rounded-[11px] bg-dash-surface border border-dash-border text-dash-ink text-sm outline-none focus:border-dash-accent/50 transition-all dash-font-sans cursor-pointer"
      >
        {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
