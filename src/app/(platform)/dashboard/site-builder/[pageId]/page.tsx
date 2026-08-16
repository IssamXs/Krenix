'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { SiteBlockNode, SitePage, Store } from '@/types/database'
import { initHistory, pushHistory, undo, redo, type HistoryState } from '@/lib/site-builder/history'
import { insertBlock, moveBlock, findBlock, findParent, duplicateBlock, removeBlock, updateBlockProps, updateBlockStyle } from '@/lib/site-builder/block-tree'
import { createBlock } from '@/lib/site-builder/block-library'
import BuilderTopBar from '@/components/site-builder/editor/BuilderTopBar'
import BuilderLeftPanel from '@/components/site-builder/editor/BuilderLeftPanel'
import BuilderCanvas from '@/components/site-builder/editor/BuilderCanvas'
import BuilderRightPanel from '@/components/site-builder/editor/BuilderRightPanel'

const AUTOSAVE_DELAY_MS = 1500

export default function SiteBuilderEditorPage() {
  const { pageId } = useParams<{ pageId: string }>()
  const [store, setStore] = useState<Store | null>(null)
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<HistoryState<SiteBlockNode[]>>(initHistory([]))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [device, setDevice] = useState<'base' | 'desktop'>('base')
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const skipNextAutosave = useRef(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const storeData = await resolveActiveStore(supabase, user.id) as Store | null
      setStore(storeData)
      const { data } = await supabase.from('site_pages').select('*').eq('id', pageId).single()
      const page = data as SitePage | null
      if (page) {
        skipNextAutosave.current = true
        setHistory(initHistory(page.blocks))
      }
      setLoading(false)
    })
  }, [pageId])

  const blocks = history.present

  const savePage = useCallback(async (blocksToSave: SiteBlockNode[]) => {
    const res = await fetch(`/api/site-pages/${pageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks: blocksToSave }),
    })
    if (!res.ok) {
      setError('Erreur lors de l\'enregistrement.')
      return false
    }
    setError(null)
    return true
  }, [pageId])

  // Autosave: debounce writes to the draft, skip the very first render (the
  // initial load itself is not an edit).
  useEffect(() => {
    if (skipNextAutosave.current) { skipNextAutosave.current = false; return }
    setSaving(true)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await savePage(blocks)
      setSaving(false)
    }, AUTOSAVE_DELAY_MS)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
    // pageId is intentionally omitted: this effect only re-runs when `blocks`
    // changes, and every render that changes `blocks` already carries the
    // current pageId (the page unmounts/remounts entirely on navigation to a
    // different [pageId] route) — see also the skipNextAutosave ordering fixed
    // in commit c2e0091, which relies on the same render/effect sequencing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, savePage])

  const setBlocks = useCallback((next: SiteBlockNode[]) => {
    setHistory(h => pushHistory(h, next))
  }, [])

  const handleDrop = useCallback((target: { parentId: string | null; index: number }, activeId: string) => {
    if (activeId.startsWith('palette:')) {
      const type = activeId.slice('palette:'.length) as SiteBlockNode['type']
      const block = createBlock(type)
      setBlocks(insertBlock(blocks, block, target.parentId, target.index))
      setSelectedId(block.id)
      return
    }
    setBlocks(moveBlock(blocks, activeId, target.parentId, target.index))
  }, [blocks, setBlocks])

  // Move a placed block up/down among its siblings (root list, or a container's
  // children). Bounds-checked: a no-op at either end of the sibling list —
  // moveBlock's insertBlock uses Array.splice, which silently clamps an
  // out-of-range index instead of erroring, so this guard is what actually
  // prevents "move up from index 0" from wrapping to the end of the array.
  const handleMoveBlock = useCallback((id: string, direction: 'up' | 'down') => {
    const parent = findParent(blocks, id)
    if (!parent) return
    const siblings = parent.parentId ? (findBlock(blocks, parent.parentId)?.children ?? []) : blocks
    const newIndex = direction === 'up' ? parent.index - 1 : parent.index + 1
    if (newIndex < 0 || newIndex >= siblings.length) return
    setBlocks(moveBlock(blocks, id, parent.parentId, newIndex))
  }, [blocks, setBlocks])

  const handleDuplicateBlock = useCallback((id: string) => {
    setBlocks(duplicateBlock(blocks, id))
  }, [blocks, setBlocks])

  const handleDeleteBlock = useCallback((id: string) => {
    setBlocks(removeBlock(blocks, id))
    setSelectedId(current => (current === id ? null : current))
  }, [blocks, setBlocks])

  const publish = async () => {
    setPublishing(true)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const saved = await savePage(blocks)
    if (!saved) { setPublishing(false); return }
    const res = await fetch(`/api/site-pages/${pageId}/publish`, { method: 'POST' })
    if (!res.ok) setError('Erreur lors de la publication.')
    setPublishing(false)
  }

  if (loading || !store) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-dash-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const selectedBlock = selectedId ? findBlock(blocks, selectedId) : null

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] -m-6">
      <BuilderTopBar
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={() => setHistory(undo)}
        onRedo={() => setHistory(redo)}
        device={device}
        onDeviceChange={setDevice}
        onPublish={publish}
        publishing={publishing}
        saving={saving}
        error={error}
      />
      <div className="flex flex-1 min-h-0">
        <BuilderLeftPanel selectedId={selectedId} />
        <BuilderCanvas
          blocks={blocks}
          store={store}
          selectedId={selectedId}
          onSelectBlock={id => setSelectedId(id || null)}
          onDrop={handleDrop}
          onMoveBlock={handleMoveBlock}
          onDuplicateBlock={handleDuplicateBlock}
          onDeleteBlock={handleDeleteBlock}
        />
        <BuilderRightPanel
          block={selectedBlock}
          device={device}
          onPropsChange={props => {
            if (!selectedId) return
            setBlocks(updateBlockProps(blocks, selectedId, props))
          }}
          onStyleChange={patch => {
            if (!selectedId) return
            setBlocks(updateBlockStyle(blocks, selectedId, device, patch))
          }}
        />
      </div>
    </div>
  )
}
