'use client'

import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import type { SiteBlockNode, Store } from '@/types/database'
import { blockStyleTagCss } from '@/lib/site-builder/style-to-css'
import CommerceBlockView from './blocks/CommerceBlocks'
import CustomHtmlBlockView from './blocks/CustomHtmlBlock'

// Allows: absolute http(s) URLs, protocol-relative URLs (//host/...), and
// same-origin relative paths (a single leading slash not followed by another
// slash, so it can't be used to smuggle a protocol-relative URL past this
// check). Rejects everything else, in particular `javascript:`, `data:`,
// `vbscript:`, and any other scheme — this is an allowlist, not a blocklist,
// so obfuscation tricks (leading whitespace, mixed case, control chars) don't
// help an attacker: anything that doesn't structurally match one of the three
// safe shapes falls back to '#'.
const SAFE_HREF_PATTERN = /^(https?:)?\/\/|^\/(?!\/)/i

// Only allow http(s), protocol-relative, or same-origin relative hrefs on the
// button block — it renders as a real, unsandboxed <a href> on the public
// storefront (unlike the custom_html block, which is deliberately
// iframe-sandboxed for exactly this class of risk), and `href` is owner-set
// content that can be written directly via PATCH /api/site-pages/[id].
function safeHref(href: string): string {
  return SAFE_HREF_PATTERN.test(href) ? href : '#'
}

interface BlockRendererProps {
  blocks: SiteBlockNode[]
  store: Store
  selectedId?: string | null
  onSelectBlock?: (id: string) => void
}

export default function BlockRenderer({ blocks, store, selectedId, onSelectBlock }: BlockRendererProps) {
  return (
    <>
      {blocks.map(node => (
        <BlockNodeView key={node.id} node={node} store={store} selectedId={selectedId} onSelectBlock={onSelectBlock} />
      ))}
    </>
  )
}

function BlockNodeView({ node, store, selectedId, onSelectBlock }: {
  node: SiteBlockNode; store: Store; selectedId?: string | null; onSelectBlock?: (id: string) => void
}) {
  const css = blockStyleTagCss(node.id, node.style)
  const handleClick = onSelectBlock
    ? (e: MouseEvent) => { e.stopPropagation(); onSelectBlock(node.id) }
    : undefined
  const outline: CSSProperties = selectedId === node.id ? { outline: '2px dashed #3f6b52', outlineOffset: '-2px' } : {}

  const children = node.children ? (
    <BlockRenderer blocks={node.children} store={store} selectedId={selectedId} onSelectBlock={onSelectBlock} />
  ) : null

  return (
    <>
      <style>{css}</style>
      <div data-block-id={node.id} onClick={handleClick} style={outline}>
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
    case 'button':
      return <a href={safeHref(String(node.props.href ?? '#'))} style={{ display: 'inline-block' }}>{String(node.props.text ?? '')}</a>
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
