// ============================================================
// KRENIX — Inbound Meta message classification
// Pure and I/O-free on purpose: the webhook's branching logic is the part that
// broke (a photo-only DM was dropped before any handler ran), and it is only
// cheaply testable if it does not touch Graph, Supabase or Gemini.
// ============================================================

// Gemini is billed per image and a customer rarely needs more than a couple of
// shots to be understood, so extra attachments are ignored rather than sent.
export const MAX_INBOUND_IMAGES = 2

export const UNSUPPORTED_ATTACHMENT_REPLY =
  "Je ne peux pas ouvrir ce type de fichier 🙏 Envoyez-moi une photo du produit ou dites-moi son nom, et je vous aide tout de suite."

export const IMAGE_FETCH_FAILED_REPLY =
  "Je n'ai pas réussi à ouvrir votre photo 🙏 Pouvez-vous la renvoyer, ou me donner le nom du produit ?"

export interface MetaInboundMessage {
  text?: string
  is_echo?: boolean
  sticker_id?: number
  attachments?: Array<{ type?: string; payload?: { url?: string } }>
}

export type InboundEvent =
  | { kind: 'skip' }
  | { kind: 'text'; text: string }
  | { kind: 'image'; text: string; imageUrls: string[] }
  | { kind: 'unsupported' }

export function classifyInboundMessage(message: MetaInboundMessage | undefined): InboundEvent {
  if (!message || message.is_echo) return { kind: 'skip' }

  const text = message.text?.trim() ?? ''

  // Messenger delivers the thumbs-up sticker as an image attachment. Feeding it
  // to the vision model as a product photo would be nonsense.
  if (message.sticker_id !== undefined) {
    return { kind: 'text', text: text || '👍' }
  }

  const attachments = message.attachments ?? []
  const imageUrls = attachments
    .filter(a => a.type === 'image' && typeof a.payload?.url === 'string' && a.payload.url.length > 0)
    .map(a => a.payload!.url as string)
    .slice(0, MAX_INBOUND_IMAGES)

  if (imageUrls.length > 0) return { kind: 'image', text, imageUrls }

  // Text wins over an attachment we cannot read: the customer told us what they
  // want, so answer that instead of complaining about the file.
  if (text) return { kind: 'text', text }

  // An attachment we cannot read and nothing else (video, audio, file, share,
  // story_mention, ig_reel). Must still produce a reply — never silence.
  if (attachments.length > 0) return { kind: 'unsupported' }

  return { kind: 'skip' }
}
