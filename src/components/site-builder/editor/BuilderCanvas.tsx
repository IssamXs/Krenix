'use client'

import { useDroppable } from '@dnd-kit/core'
import type { SiteBlockNode, Store } from '@/types/database'
import BlockRenderer from '@/components/site-builder/BlockRenderer'

interface Props {
  blocks: SiteBlockNode[]
  store: Store
  selectedId: string | null
  onSelectBlock: (id: string) => void
  onMoveBlock: (id: string, direction: 'up' | 'down') => void
  onDuplicateBlock: (id: string) => void
  onDeleteBlock: (id: string) => void
}

function RootDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: 'container:root' })
  return <div ref={setNodeRef} className="kb-page min-h-[400px]">{children}</div>
}

// No <DndContext> here on purpose — it must wrap this canvas AND
// BuilderLeftPanel's draggable palette items together (they're siblings in
// the editor page), otherwise dnd-kit's useDraggable/useDroppable hooks have
// no shared context to coordinate through and dragging silently does nothing.
// See SiteBuilderEditorPage, which owns the single DndContext for both.
export default function BuilderCanvas({ blocks, store, selectedId, onSelectBlock, onMoveBlock, onDuplicateBlock, onDeleteBlock }: Props) {
  return (
    <div className="flex-1 overflow-auto bg-dash-surface-2 p-5" onClick={() => onSelectBlock('')}>
      <RootDropZone>
        {blocks.length === 0 ? (
          <div className="border-2 border-dashed border-dash-border rounded-xl py-16 text-center text-dash-ink-faint text-sm">
            Glissez un bloc ici pour commencer
          </div>
        ) : (
          <BlockRenderer
            blocks={blocks}
            store={store}
            selectedId={selectedId}
            onSelectBlock={onSelectBlock}
            onMoveBlock={onMoveBlock}
            onDuplicateBlock={onDuplicateBlock}
            onDeleteBlock={onDeleteBlock}
          />
        )}
      </RootDropZone>
    </div>
  )
}
