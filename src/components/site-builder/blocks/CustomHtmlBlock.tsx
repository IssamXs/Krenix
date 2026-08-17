'use client'

import type { SiteBlockNode } from '@/types/database'

// Rendered in a sandboxed iframe (srcdoc), never dangerouslySetInnerHTML —
// isolates arbitrary owner-authored script/CSS from the rest of the
// storefront page's DOM even though it only ever runs on the owner's own
// subdomain. `allow-scripts` without `allow-same-origin` means any script
// inside runs in a unique opaque origin: it cannot reach cookies, localStorage,
// or the parent document.
export default function CustomHtmlBlockView({ node }: { node: SiteBlockNode }) {
  const html = String(node.props.html ?? '')
  if (!html) return null
  return (
    <iframe
      srcDoc={html}
      sandbox="allow-scripts"
      style={{ width: '100%', border: 'none', minHeight: '1px' }}
      title="Contenu personnalisé"
    />
  )
}
