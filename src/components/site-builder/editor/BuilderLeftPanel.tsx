'use client'

import { useDraggable } from '@dnd-kit/core'
import { BLOCK_LIBRARY, type BlockLibraryEntry } from '@/lib/site-builder/block-library'

function PaletteItem({ entry }: { entry: BlockLibraryEntry }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: `palette:${entry.type}` })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 } : undefined
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className="border border-dash-border rounded-xl px-2 py-2.5 text-center text-[11px] font-semibold text-dash-ink-soft cursor-grab hover:border-dash-accent hover:bg-dash-accent-soft transition-all"
    >
      {entry.label}
    </div>
  )
}

const CATEGORY_LABELS: Record<BlockLibraryEntry['category'], string> = {
  layout: 'Disposition',
  content: 'Contenu',
  commerce: 'Commerce',
  conversion: 'Conversion',
  advanced: 'Avancé',
}

export default function BuilderLeftPanel({ selectedId }: { selectedId: string | null }) {
  const categories = Array.from(new Set(BLOCK_LIBRARY.map(e => e.category)))
  return (
    <div className="w-[210px] flex-shrink-0 border-r border-dash-border bg-dash-surface overflow-y-auto p-3 space-y-5">
      {categories.map(category => (
        <div key={category}>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-dash-ink-faint mb-2">{CATEGORY_LABELS[category]}</p>
          <div className="grid grid-cols-2 gap-2">
            {BLOCK_LIBRARY.filter(e => e.category === category).map(entry => (
              <PaletteItem key={entry.type} entry={entry} />
            ))}
          </div>
        </div>
      ))}
      {selectedId && (
        <p className="text-[11px] text-dash-ink-faint pt-2 border-t border-dash-border">Bloc sélectionné : {selectedId.slice(0, 8)}</p>
      )}
    </div>
  )
}
