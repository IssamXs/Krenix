import type { SiteBlockNode } from '@/types/database'
import { createBlock } from './block-library'

export interface StarterTemplate {
  id: string
  label: string
  description: string
  build: () => SiteBlockNode[]
}

function textRow(text: string, styleOverride: Record<string, string> = {}): SiteBlockNode {
  const block = createBlock('text')
  block.props = { text }
  block.style = { base: { padding: '24px 16px', ...styleOverride } }
  return block
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'blank',
    label: 'Page vierge',
    description: 'Partez de zéro et construisez votre page bloc par bloc.',
    build: () => [],
  },
  {
    id: 'about',
    label: 'À propos',
    description: 'Un titre et un paragraphe pour présenter votre boutique.',
    build: () => [
      textRow('À propos de nous', { fontSize: '28px', fontWeight: '700', textAlign: 'center' }),
      textRow('Racontez votre histoire ici : qui vous êtes, ce que vous vendez, pourquoi vos clients vous font confiance.'),
    ],
  },
  {
    id: 'faq',
    label: 'FAQ',
    description: 'Un titre suivi d\'un bloc de questions fréquentes.',
    build: () => {
      const faq = createBlock('faq_accordion')
      faq.props = { items: [{ question: 'Quels sont les délais de livraison ?', answer: 'Entre 2 et 5 jours selon votre wilaya.' }] }
      return [textRow('Questions fréquentes', { fontSize: '28px', fontWeight: '700', textAlign: 'center' }), faq]
    },
  },
  {
    id: 'contact',
    label: 'Contact',
    description: 'Un titre et un bouton WhatsApp pour être contacté rapidement.',
    build: () => {
      const wa = createBlock('whatsapp_button')
      wa.props = { text: 'Nous contacter sur WhatsApp' }
      return [textRow('Contactez-nous', { fontSize: '28px', fontWeight: '700', textAlign: 'center' }), wa]
    },
  },
  {
    id: 'promo',
    label: 'Page promo',
    description: 'Titre accrocheur, compte à rebours, et bouton de commande.',
    build: () => {
      const countdown = createBlock('countdown')
      countdown.props = { endsAt: null, text: 'Offre limitée dans le temps' }
      const wa = createBlock('whatsapp_button')
      wa.props = { text: 'Profiter de l\'offre' }
      return [textRow('Une offre à ne pas manquer', { fontSize: '32px', fontWeight: '800', textAlign: 'center' }), countdown, wa]
    },
  },
]

export function getStarterTemplate(id: string): StarterTemplate {
  const found = STARTER_TEMPLATES.find(t => t.id === id)
  return found ?? STARTER_TEMPLATES[0]
}
