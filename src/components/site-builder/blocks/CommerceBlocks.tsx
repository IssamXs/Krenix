'use client'

import { useState } from 'react'
import type { SiteBlockNode, Store } from '@/types/database'
import { WILAYAS } from '@/lib/wilayas'
import { toWaNumber } from '@/lib/whatsapp'

interface Props {
  node: SiteBlockNode
  store: Store
}

export default function CommerceBlockView({ node, store }: Props) {
  switch (node.type) {
    case 'whatsapp_button':
      return <WhatsappButton text={String(node.props.text ?? 'Commander sur WhatsApp')} store={store} />
    case 'price':
      return <PriceDisplay productId={node.props.productId as string | null} />
    case 'product':
      return <ProductEmbed productId={node.props.productId as string | null} />
    case 'order_form':
      return (
        <OrderForm
          storeId={store.id}
          productId={node.props.productId as string | null}
          title={String(node.props.title ?? 'Commander maintenant')}
        />
      )
    default:
      return null
  }
}

function WhatsappButton({ text, store }: { text: string; store: Store }) {
  const waNumber = toWaNumber(store.settings?.whatsapp)
  if (!waNumber) return null
  const href = `https://wa.me/${waNumber}?text=${encodeURIComponent(`Bonjour ${store.name}, je souhaite commander.`)}`
  return <a href={href} target="_blank" rel="noopener noreferrer">{text}</a>
}

function PriceDisplay({ productId }: { productId: string | null }) {
  if (!productId) return <span>—</span>
  // Product price is fetched by the page-level product join in a future phase;
  // Phase 1 renders whatever the block's own props carry (set from the editor's
  // product picker), keeping this block free of its own network fetch.
  return <span data-product-id={productId} />
}

function ProductEmbed({ productId }: { productId: string | null }) {
  if (!productId) return <div>Choisissez un produit dans le panneau de droite.</div>
  return <div data-product-id={productId} />
}

function OrderForm({ storeId, productId, title }: { storeId: string; productId: string | null; title: string }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [wilaya, setWilaya] = useState('')
  const [commune, setCommune] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const submit = async () => {
    setStatus('sending')
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          product_id: productId,
          customer_name: name,
          customer_phone: phone,
          wilaya,
          commune,
          quantity: 1,
          source: 'form',
        }),
      })
      setStatus(res.ok ? 'sent' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') return <p>Merci ! Votre commande a été reçue.</p>

  return (
    <div>
      <h3>{title}</h3>
      <input placeholder="Nom complet" value={name} onChange={e => setName(e.target.value)} />
      <input placeholder="Téléphone" value={phone} onChange={e => setPhone(e.target.value)} />
      <select value={wilaya} onChange={e => setWilaya(e.target.value)}>
        <option value="">Wilaya</option>
        {WILAYAS.map(w => <option key={w} value={w}>{w}</option>)}
      </select>
      <input placeholder="Commune" value={commune} onChange={e => setCommune(e.target.value)} />
      <button type="button" onClick={submit} disabled={status === 'sending' || !name || !phone || !wilaya || !commune}>
        {status === 'sending' ? 'Envoi…' : 'Commander'}
      </button>
      {status === 'error' && <p>Une erreur est survenue, réessayez.</p>}
    </div>
  )
}
