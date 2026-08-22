import type { SiteBlockNode } from '@/types/database'

export function findBlock(tree: SiteBlockNode[], id: string): SiteBlockNode | null {
  for (const node of tree) {
    if (node.id === id) return node
    if (node.children) {
      const found = findBlock(node.children, id)
      if (found) return found
    }
  }
  return null
}

export function findParent(tree: SiteBlockNode[], id: string): { parentId: string | null; index: number } | null {
  const rootIndex = tree.findIndex(n => n.id === id)
  if (rootIndex !== -1) return { parentId: null, index: rootIndex }

  for (const node of tree) {
    if (!node.children) continue
    const childIndex = node.children.findIndex(c => c.id === id)
    if (childIndex !== -1) return { parentId: node.id, index: childIndex }
    const nested = findParent(node.children, id)
    if (nested) return nested
  }
  return null
}

function mapContainer(tree: SiteBlockNode[], containerId: string, fn: (children: SiteBlockNode[]) => SiteBlockNode[]): SiteBlockNode[] {
  return tree.map(node => {
    if (node.id === containerId) return { ...node, children: fn(node.children ?? []) }
    if (node.children) return { ...node, children: mapContainer(node.children, containerId, fn) }
    return node
  })
}

export function insertBlock(tree: SiteBlockNode[], block: SiteBlockNode, parentId: string | null, index: number): SiteBlockNode[] {
  if (parentId === null) {
    const next = [...tree]
    next.splice(index, 0, block)
    return next
  }
  return mapContainer(tree, parentId, children => {
    const next = [...children]
    next.splice(index, 0, block)
    return next
  })
}

export function removeBlock(tree: SiteBlockNode[], id: string): SiteBlockNode[] {
  return tree
    .filter(node => node.id !== id)
    .map(node => (node.children ? { ...node, children: removeBlock(node.children, id) } : node))
}

export function moveBlock(tree: SiteBlockNode[], id: string, newParentId: string | null, index: number): SiteBlockNode[] {
  const block = findBlock(tree, id)
  if (!block) return tree
  const withoutBlock = removeBlock(tree, id)
  return insertBlock(withoutBlock, block, newParentId, index)
}

function cloneWithNewIds(node: SiteBlockNode): SiteBlockNode {
  return {
    ...node,
    id: crypto.randomUUID(),
    props: { ...node.props },
    style: { base: { ...node.style.base }, ...(node.style.desktop ? { desktop: { ...node.style.desktop } } : {}) },
    children: node.children?.map(cloneWithNewIds),
  }
}

export function duplicateBlock(tree: SiteBlockNode[], id: string): SiteBlockNode[] {
  const parent = findParent(tree, id)
  const block = findBlock(tree, id)
  if (!parent || !block) return tree
  const copy = cloneWithNewIds(block)
  return insertBlock(tree, copy, parent.parentId, parent.index + 1)
}

export function updateBlockProps(tree: SiteBlockNode[], id: string, props: Record<string, unknown>): SiteBlockNode[] {
  return tree.map(node => {
    if (node.id === id) return { ...node, props: { ...node.props, ...props } }
    if (node.children) return { ...node, children: updateBlockProps(node.children, id, props) }
    return node
  })
}

export function updateBlockStyle(
  tree: SiteBlockNode[], id: string, breakpoint: 'base' | 'desktop', patch: Record<string, string>,
): SiteBlockNode[] {
  return tree.map(node => {
    if (node.id === id) {
      const style = { ...node.style }
      style[breakpoint] = { ...(style[breakpoint] ?? {}), ...patch }
      return { ...node, style }
    }
    if (node.children) return { ...node, children: updateBlockStyle(node.children, id, breakpoint, patch) }
    return node
  })
}

/**
 * Turns a dnd-kit drop target id into an insertion point.
 * "container:<id>" → append at the end of that container's children.
 * "<blockId>" (an existing block) → insert immediately before it, in its own parent.
 */
export function resolveDropTarget(overId: string, tree: SiteBlockNode[]): { parentId: string | null; index: number } | null {
  if (overId.startsWith('container:')) {
    const containerId = overId.slice('container:'.length)
    const container = findBlock(tree, containerId)
    if (!container) return null
    return { parentId: containerId, index: container.children?.length ?? 0 }
  }
  return findParent(tree, overId)
}
