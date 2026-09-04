import type { Order, OrderStatus, StoreSettings, OrderMessagesSettings } from '@/types/database'

export type OrderMessages = OrderMessagesSettings

// ============================================================
// WhatsApp click-to-send helpers (wa.me)
// Free, no API — opens WhatsApp with a pre-filled message.
// ============================================================

/**
 * Normalize an Algerian phone number to WhatsApp international format.
 * Local stored form is `0X XX XX XX XX` (10 digits, leading 0).
 * wa.me expects the full international number without `+` or leading 0:
 *   0555123456 -> 213555123456
 * Returns null if the number can't be normalized.
 */
export function toWaNumber(phone: string | null | undefined): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (!digits) return null
  // Already international (starts with 213)
  if (digits.startsWith('213')) {
    digits = digits.slice(3)
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1)
  }
  // Algerian mobile/fixed local part is 9 digits after the leading 0
  if (digits.length !== 9) return null
  return `213${digits}`
}

/**
 * Build a wa.me click-to-send URL. Returns null if the number is invalid.
 */
export function buildWaLink(phone: string | null | undefined, message: string): string | null {
  const number = toWaNumber(phone)
  if (!number) return null
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}

// ============================================================
// Placeholder templating
// ============================================================

export interface OrderMessageVars {
  name: string
  order_number: string
  product: string
  subtotal: string
  delivery: string
  delivery_method: string
  remise: string
  total: string
  wilaya: string
  commune: string
  store: string
}

/**
 * Replace {placeholder} tokens in a template with values.
 * Unknown tokens are left as-is.
 */
export function renderTemplate(template: string, vars: OrderMessageVars): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key as keyof OrderMessageVars]) : match
  )
}

/**
 * Build the templating variables from an order + store context.
 */
export function orderMessageVars(
  // free_delivery / discount_amount are optional here: storefront checkout
  // orders never set them (edit-only), and their callers pass a narrower shape.
  order: Pick<Order, 'customer_name' | 'order_number' | 'total_price' | 'wilaya' | 'commune' | 'color' | 'quantity' | 'unit_price' | 'delivery_price' | 'delivery_type'>
    & Partial<Pick<Order, 'free_delivery' | 'discount_amount'>>,
  opts: { storeName: string; productName?: string | null },
  locale: 'fr' | 'ar' = 'fr'
): OrderMessageVars {
  const firstName = order.customer_name.trim().split(/\s+/)[0] || order.customer_name
  const money = (n: number) => `${Number(n).toLocaleString('fr-DZ')} DA`
  const deliveryMethod = order.delivery_type === 'desk'
    ? (locale === 'ar' ? 'استلام من مكتب Stop Desk' : 'Retrait en point Stop Desk')
    : (locale === 'ar' ? 'توصيل إلى المنزل' : 'Livraison à domicile')
  return {
    name: firstName,
    order_number: order.order_number,
    product: opts.productName || order.color || 'votre commande',
    subtotal: money(order.unit_price * order.quantity),
    // A free-delivery order shows the fee as waived rather than a number the
    // customer would otherwise expect added to the total.
    delivery: order.free_delivery ? (locale === 'ar' ? 'مجانية' : 'Offerte') : money(order.delivery_price),
    delivery_method: deliveryMethod,
    remise: Number(order.discount_amount) > 0 ? `- ${money(Number(order.discount_amount))}` : '',
    total: money(order.total_price),
    wilaya: order.wilaya,
    commune: order.commune,
    store: opts.storeName,
  }
}

// ============================================================
// Message templates
// ============================================================

export type OrderMessageKey = Extract<
  OrderStatus,
  'confirmed' | 'chez_livreur' | 'en_livraison' | 'livree' | 'annulee'
>

/** Default French templates. Placeholders: {name} {order_number} {product} {total} {wilaya} {commune} {store} */
export const DEFAULT_ORDER_MESSAGES: Required<OrderMessages> = {
  confirmed:
    'Bonjour {name} 👋\nVotre commande {order_number} chez {store} est confirmée ✅\nProduit : {product} — Prix : {subtotal}\nLivraison : {delivery} — {delivery_method} à {commune}, {wilaya}\nTotal : {total}\nMerci pour votre confiance 🙏',
  chez_livreur:
    'Bonjour {name} 📦\nVotre commande {order_number} est prête et remise au livreur.\nElle sera bientôt en route vers {commune}, {wilaya}.',
  en_livraison:
    'Bonjour {name} 🚚\nVotre colis {order_number} est en cours de livraison vers {commune}, {wilaya}.\nMerci de garder votre téléphone allumé pour le livreur.',
  livree:
    'Bonjour {name} 🎉\nNous espérons que vous êtes satisfait(e) de votre commande {order_number} !\nMerci d\'avoir commandé chez {store}. N\'hésitez pas à nous laisser votre avis 💛',
  annulee:
    'Bonjour {name}\nVotre commande {order_number} chez {store} a été annulée.\nSi c\'est une erreur ou si vous souhaitez commander à nouveau, contactez-nous ici. Merci 🙏',
}

/** Default Arabic templates. Same placeholders. */
export const DEFAULT_ORDER_MESSAGES_AR: Required<OrderMessages> = {
  confirmed:
    'مرحبا {name} 👋\nطلبك رقم {order_number} في متجر {store} تم تأكيده ✅\nالمنتج: {product} — السعر: {subtotal}\nالتوصيل: {delivery} — {delivery_method} إلى {commune}، {wilaya}\nالإجمالي: {total}\nشكرًا لثقتك 🙏',
  chez_livreur:
    'مرحبا {name} 📦\nطلبك رقم {order_number} جاهز وتم تسليمه للموزع.\nسيكون قريبًا في طريقه إلى {commune}، {wilaya}.',
  en_livraison:
    'مرحبا {name} 🚚\nطردك رقم {order_number} في طور التوصيل إلى {commune}، {wilaya}.\nيرجى إبقاء هاتفك مفتوحًا للموزع.',
  livree:
    'مرحبا {name} 🎉\nنأمل أن تكون راضيًا عن طلبك رقم {order_number}!\nشكرًا لطلبك من {store}. لا تتردد في ترك رأيك 💛',
  annulee:
    'مرحبا {name}\nطلبك رقم {order_number} في متجر {store} تم إلغاؤه.\nإذا كان ذلك خطأ أو تريد الطلب مجددًا، تواصل معنا هنا. شكرًا 🙏',
}

/**
 * Resolve the template text for a status, using merchant overrides then locale defaults.
 */
export function messageForStatus(
  status: OrderStatus,
  custom?: OrderMessages,
  locale: 'fr' | 'ar' = 'fr'
): string | null {
  if (!(status in DEFAULT_ORDER_MESSAGES)) return null
  const key = status as OrderMessageKey
  const override = custom?.[key]?.trim()
  if (override) return override
  return locale === 'ar' ? DEFAULT_ORDER_MESSAGES_AR[key] : DEFAULT_ORDER_MESSAGES[key]
}

/**
 * Build the customer-side order recap message (customer -> merchant WhatsApp),
 * shown on the order success screen so the buyer can confirm their order.
 */
export function customerConfirmMessage(vars: OrderMessageVars, locale: 'fr' | 'ar' = 'fr'): string {
  if (locale === 'ar') {
    return (
      `مرحبا ${vars.store} 👋\n` +
      `أؤكد طلبي:\n` +
      `• الرقم: ${vars.order_number}\n` +
      `• المنتج: ${vars.product}\n` +
      `• الإجمالي: ${vars.total}\n` +
      `• التوصيل: ${vars.commune}، ${vars.wilaya}\n` +
      `الاسم: ${vars.name}`
    )
  }
  return (
    `Bonjour ${vars.store} 👋\n` +
    `Je confirme ma commande :\n` +
    `• N° : ${vars.order_number}\n` +
    `• Produit : ${vars.product}\n` +
    `• Total : ${vars.total}\n` +
    `• Livraison : ${vars.commune}, ${vars.wilaya}\n` +
    `Nom : ${vars.name}`
  )
}

/** Convenience: does this store have a usable WhatsApp number configured? */
export function storeWhatsapp(settings: StoreSettings | null | undefined): string | null {
  return settings?.whatsapp ? toWaNumber(settings.whatsapp) : null
}

/**
 * "Your order was updated" recap, sent after a manual edit (see the order
 * edit feature in dashboard/orders/page.tsx). Not customizable in settings
 * like the status templates — a single default per locale.
 */
export function orderUpdatedMessage(vars: OrderMessageVars, locale: 'fr' | 'ar' = 'fr'): string {
  if (locale === 'ar') {
    return (
      `مرحبا ${vars.name} ✏️\n` +
      `تم تحديث طلبك رقم ${vars.order_number} لدى ${vars.store} :\n` +
      `المنتج : ${vars.product}\n` +
      `الإجمالي : ${vars.total}\n` +
      `التوصيل : ${vars.delivery_method} إلى ${vars.commune}، ${vars.wilaya}\n` +
      `إذا كان هناك خطأ، تواصل معنا. شكرًا 🙏`
    )
  }
  return (
    `Bonjour ${vars.name} ✏️\n` +
    `Votre commande ${vars.order_number} chez ${vars.store} a été mise à jour :\n` +
    `Produit : ${vars.product}\n` +
    `Total : ${vars.total}\n` +
    `Livraison : ${vars.delivery_method} à ${vars.commune}, ${vars.wilaya}\n` +
    `Si une erreur s'est glissée, contactez-nous. Merci 🙏`
  )
}
