'use client'

import { DndContext, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import type { SiteBlockNode, Store } from '@/types/database'
import { resolveDropTarget } from '@/lib/site-builder/block-tree'
import BlockRenderer from '@/components/site-builder/BlockRenderer'

interface Props {
  blocks: SiteBlockNode[]
  store: Store
  selectedId: string | null
  onSelectBlock: (id: string) => void
  onDrop: (target: { parentId: string | null; index: number }, activeId: string) => void
  onMoveBlock: (id: string, direction: 'up' | 'down') => void
  onDuplicateBlock: (id: string) => void
  onDeleteBlock: (id: string) => void
}

function RootDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: 'container:root' })
  return <div ref={setNodeRef} className="kb-page min-h-[400px]">{children}</div>
}

export default function BuilderCanvas({ blocks, store, selectedId, onSelectBlock, onDrop, onMoveBlock, onDuplicateBlock, onDeleteBlock }: Props) {
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)

    if (overId === 'container:root') {
      onDrop({ parentId: null, index: blocks.length }, activeId)
      return
    }
    const target = resolveDropTarget(overId, blocks)
    if (target) onDrop(target, activeId)
  }

  return (
    <div className="flex-1 overflow-auto bg-dash-surface-2 p-5" onClick={() => onSelectBlock('')}>
      <DndContext onDragEnd={handleDragEnd}>
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
      </DndContext>
    </div>
  )
}
