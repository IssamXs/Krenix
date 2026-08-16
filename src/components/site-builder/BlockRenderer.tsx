'use client'

import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { SiteBlockNode, Store } from '@/types/database'
import { blockStyleTagCss } from '@/lib/site-builder/style-to-css'
import CommerceBlockView from './blocks/CommerceBlocks'
import CustomHtmlBlockView from './blocks/CustomHtmlBlock'

// Only allow http(s) or protocol-relative hrefs — rejects javascript:, data:,
// and any other scheme an owner could set on a button block's href, since this
// renders as a real, unsandboxed <a href> on the public storefront (unlike the
// custom_html block, which is deliberately iframe-sandboxed for exactly this
// class of risk).
const SAFE_HREF_SCHEME = /^(https?:)?\/\/|^\/(?!\/)/i

interface BlockRendererProps {
  blocks: SiteBlockNode[]
  store: Store
  selectedId?: string | null
  onSelectBlock?: (id: string) => void
  onMoveBlock?: (id: string, direction: 'up' | 'down') => void
  onDuplicateBlock?: (id: string) => void
  onDeleteBlock?: (id: string) => void
}

export default function BlockRenderer({ blocks, store, selectedId, onSelectBlock, onMoveBlock, onDuplicateBlock, onDeleteBlock }: BlockRendererProps) {
  return (
    <>
      {blocks.map(node => (
        <BlockNodeView
          key={node.id}
          node={node}
          store={store}
          selectedId={selectedId}
          onSelectBlock={onSelectBlock}
          onMoveBlock={onMoveBlock}
          onDuplicateBlock={onDuplicateBlock}
          onDeleteBlock={onDeleteBlock}
        />
      ))}
    </>
  )
}

function BlockNodeView({ node, store, selectedId, onSelectBlock, onMoveBlock, onDuplicateBlock, onDeleteBlock }: {
  node: SiteBlockNode
  store: Store
  selectedId?: string | null
  onSelectBlock?: (id: string) => void
  onMoveBlock?: (id: string, direction: 'up' | 'down') => void
  onDuplicateBlock?: (id: string) => void
  onDeleteBlock?: (id: string) => void
}) {
  const isContainer = node.children !== undefined
  const editable = !!onSelectBlock
  // Registers this block as a drop target ONLY when it's a container (row/column/
  // container) and we're in the editor (onSelectBlock present). resolveDropTarget's
  // "container:<id>" branch is what actually reads this id on drop — see
  // src/lib/site-builder/block-tree.ts. Disabled (not unmounted) so hook order stays
  // stable across renders, per the Rules of Hooks.
  const droppable = useDroppable({ id: `container:${node.id}`, disabled: !isContainer || !editable })

  const css = blockStyleTagCss(node.id, node.style)
  const handleClick = onSelectBlock
    ? (e: MouseEvent) => { e.stopPropagation(); onSelectBlock(node.id) }
    : undefined
  const isSelected = selectedId === node.id
  const style: CSSProperties = {
    position: editable ? 'relative' : undefined,
    ...(isSelected ? { outline: '2px dashed #3f6b52', outlineOffset: '-2px' } : {}),
    ...(droppable.isOver ? { outline: '2px solid #b8863b', outlineOffset: '-2px' } : {}),
  }

  const children = node.children ? (
    <BlockRenderer
      blocks={node.children}
      store={store}
      selectedId={selectedId}
      onSelectBlock={onSelectBlock}
      onMoveBlock={onMoveBlock}
      onDuplicateBlock={onDuplicateBlock}
      onDeleteBlock={onDeleteBlock}
    />
  ) : null

  return (
    <>
      <style>{css}</style>
      <div
        ref={isContainer && editable ? droppable.setNodeRef : undefined}
        data-block-id={node.id}
        onClick={handleClick}
        style={style}
      >
        {isSelected && editable && (
          <div
            style={{
              position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)',
              background: '#2c4d3b', color: 'white', fontSize: '10.5px', borderRadius: '999px',
              padding: '4px 10px', display: 'flex', gap: '8px', whiteSpace: 'nowrap', zIndex: 2,
            }}
          >
            <button type="button" onClick={e => { e.stopPropagation(); onMoveBlock?.(node.id, 'up') }} style={{ color: 'inherit', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} aria-label="Monter">↑</button>
            <button type="button" onClick={e => { e.stopPropagation(); onMoveBlock?.(node.id, 'down') }} style={{ color: 'inherit', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} aria-label="Descendre">↓</button>
            <button type="button" onClick={e => { e.stopPropagation(); onDuplicateBlock?.(node.id) }} style={{ color: 'inherit', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Dupliquer</button>
            <button type="button" onClick={e => { e.stopPropagation(); onDeleteBlock?.(node.id) }} style={{ color: 'inherit', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} aria-label="Supprimer">🗑</button>
          </div>
        )}
        {renderBlock(node, store, children)}
      </div>
    </>
  )
}

function renderBlock(node: SiteBlockNode, store: Store, children: ReactNode) {
  switch (node.type) {
    // Layout
    case 'row':
      return <div style={{ display: 'flex', flexWrap: 'wrap' }}>{children}</div>
    case 'column':
      return <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    case 'container':
      return <div>{children}</div>
    case 'spacer':
      return <div />

    // Content
    case 'text':
      return <p>{String(node.props.text ?? '')}</p>
    case 'image': {
      const src = String(node.props.src ?? '')
      if (!src) return <div style={{ background: '#eee', minHeight: '80px' }} />
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={src} alt={String(node.props.alt ?? '')} style={{ maxWidth: '100%', display: 'block' }} />
    }
    case 'button': {
      const rawHref = String(node.props.href ?? '#')
      const href = SAFE_HREF_SCHEME.test(rawHref) ? rawHref : '#'
      return <a href={href} style={{ display: 'inline-block' }}>{String(node.props.text ?? '')}</a>
    }
    case 'video': {
      const src = String(node.props.src ?? '')
      return src ? <video src={src} controls style={{ maxWidth: '100%' }} /> : null
    }
    case 'icon':
      return <span aria-hidden>★</span>

    // Commerce
    case 'product':
    case 'order_form':
    case 'price':
    case 'whatsapp_button':
      return <CommerceBlockView node={node} store={store} />

    // Conversion
    case 'testimonials': {
      const items = Array.isArray(node.props.items) ? node.props.items as { name?: string; text?: string }[] : []
      return (
        <div>
          {items.map((t, i) => (
            <blockquote key={i}>
              <p>{t.text}</p>
              {t.name && <cite>{t.name}</cite>}
            </blockquote>
          ))}
        </div>
      )
    }
    case 'countdown':
      return <div>{String(node.props.text ?? '')}</div>
    case 'trust_badges': {
      const items = Array.isArray(node.props.items) ? node.props.items as { label?: string }[] : []
      return <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>{items.map((b, i) => <span key={i}>{b.label}</span>)}</div>
    }
    case 'faq_accordion': {
      const items = Array.isArray(node.props.items) ? node.props.items as { question?: string; answer?: string }[] : []
      return (
        <div>
          {items.map((f, i) => (
            <details key={i}>
              <summary>{f.question}</summary>
              <p>{f.answer}</p>
            </details>
          ))}
        </div>
      )
    }

    case 'custom_html':
      return <CustomHtmlBlockView node={node} />

    default:
      return null
  }
}
