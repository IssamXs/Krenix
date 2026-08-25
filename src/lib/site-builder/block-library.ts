import type { SiteBlockNode, SiteBlockType, SiteBlockStyle } from '@/types/database'
import { SITE_BLOCK_CONTAINER_TYPES } from '@/types/database'

export type BlockCategory = 'layout' | 'content' | 'commerce' | 'conversion' | 'advanced'

export interface BlockLibraryEntry {
  type: SiteBlockType
  label: string
  category: BlockCategory
  isContainer: boolean
  defaultProps: Record<string, unknown>
  defaultStyle: SiteBlockStyle
}

const PAD_STYLE: SiteBlockStyle = { base: { padding: '16px' } }
const NONE_STYLE: SiteBlockStyle = { base: {} }

export const BLOCK_LIBRARY: BlockLibraryEntry[] = [
  // Layout
  { type: 'row', label: 'Rangée', category: 'layout', isContainer: true, defaultProps: {}, defaultStyle: NONE_STYLE },
  { type: 'column', label: 'Colonne', category: 'layout', isContainer: true, defaultProps: {}, defaultStyle: PAD_STYLE },
  { type: 'container', label: 'Conteneur', category: 'layout', isContainer: true, defaultProps: {}, defaultStyle: PAD_STYLE },
  { type: 'spacer', label: 'Espaceur', category: 'layout', isContainer: false, defaultProps: {}, defaultStyle: { base: { height: '32px' } } },
  // Content
  { type: 'text', label: 'Texte', category: 'content', isContainer: false, defaultProps: { text: 'Votre texte ici' }, defaultStyle: NONE_STYLE },
  { type: 'image', label: 'Image', category: 'content', isContainer: false, defaultProps: { src: '', alt: '' }, defaultStyle: NONE_STYLE },
  { type: 'button', label: 'Bouton', category: 'content', isContainer: false, defaultProps: { text: 'Cliquez ici', href: '#' }, defaultStyle: NONE_STYLE },
  { type: 'video', label: 'Vidéo', category: 'content', isContainer: false, defaultProps: { src: '' }, defaultStyle: NONE_STYLE },
  { type: 'icon', label: 'Icône', category: 'content', isContainer: false, defaultProps: { name: 'Star' }, defaultStyle: NONE_STYLE },
  // Commerce
  { type: 'product', label: 'Produit', category: 'commerce', isContainer: false, defaultProps: { productId: null }, defaultStyle: NONE_STYLE },
  { type: 'order_form', label: 'Formulaire de commande', category: 'commerce', isContainer: false, defaultProps: { productId: null, title: 'Commander maintenant' }, defaultStyle: NONE_STYLE },
  { type: 'price', label: 'Prix', category: 'commerce', isContainer: false, defaultProps: { productId: null }, defaultStyle: NONE_STYLE },
  { type: 'whatsapp_button', label: 'Bouton WhatsApp', category: 'commerce', isContainer: false, defaultProps: { text: 'Commander sur WhatsApp' }, defaultStyle: NONE_STYLE },
  // Conversion
  { type: 'testimonials', label: 'Témoignages', category: 'conversion', isContainer: false, defaultProps: { items: [] }, defaultStyle: NONE_STYLE },
  { type: 'countdown', label: 'Compte à rebours', category: 'conversion', isContainer: false, defaultProps: { endsAt: null, text: 'Offre limitée' }, defaultStyle: NONE_STYLE },
  { type: 'trust_badges', label: 'Badges de confiance', category: 'conversion', isContainer: false, defaultProps: { items: [] }, defaultStyle: NONE_STYLE },
  { type: 'faq_accordion', label: 'FAQ', category: 'conversion', isContainer: false, defaultProps: { items: [] }, defaultStyle: NONE_STYLE },
  // Advanced
  { type: 'custom_html', label: 'HTML personnalisé', category: 'advanced', isContainer: false, defaultProps: { html: '' }, defaultStyle: NONE_STYLE },
]

const BY_TYPE = new Map(BLOCK_LIBRARY.map(e => [e.type, e]))

export function getBlockLibraryEntry(type: SiteBlockType): BlockLibraryEntry {
  const entry = BY_TYPE.get(type)
  if (!entry) throw new Error(`Unknown block type: ${type}`)
  return entry
}

export function createBlock(type: SiteBlockType): SiteBlockNode {
  const entry = getBlockLibraryEntry(type)
  const base: SiteBlockNode = {
    id: crypto.randomUUID(),
    type,
    props: structuredClone(entry.defaultProps),
    style: { base: { ...entry.defaultStyle.base }, ...(entry.defaultStyle.desktop ? { desktop: { ...entry.defaultStyle.desktop } } : {}) },
  }
  return SITE_BLOCK_CONTAINER_TYPES.includes(type) ? { ...base, children: [] } : base
}
