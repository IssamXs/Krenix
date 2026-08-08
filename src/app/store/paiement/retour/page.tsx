import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { CheckCircle2, XCircle, ArrowLeft } from 'lucide-react'

export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; failed?: string; order?: string }>
}) {
  const { paid, order } = await searchParams
  const headersList = await headers()
  const storeSlug = headersList.get('x-store-slug')

  let storeName = 'la boutique'
  let storeHref = '/'
  if (storeSlug) {
    const supabase = await createClient()
    const { data: store } = await supabase.from('stores').select('name, slug').eq('slug', storeSlug).maybeSingle()
    if (store) {
      storeName = store.name
      storeHref = `/?store=${store.slug}`
    }
  }

  const success = paid === '1'

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0A0A0F' }}>
      <div className="w-full max-w-md rounded-2xl p-8 text-center" style={{ background: '#111118', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: success ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }}
        >
          {success
            ? <CheckCircle2 size={32} style={{ color: '#22C55E' }} />
            : <XCircle size={32} style={{ color: '#EF4444' }} />}
        </div>
        <h1 className="text-xl font-bold text-white mb-2">
          {success ? 'Paiement reçu !' : 'Paiement non confirmé'}
        </h1>
        <p className="text-sm mb-1" style={{ color: '#9CA3AF' }}>
          {success
            ? `Merci pour votre commande chez ${storeName}. Vous recevrez une confirmation prochainement.`
            : "Nous n'avons pas pu confirmer votre paiement. Si le montant a été débité, contactez le vendeur avec votre numéro de commande."}
        </p>
        {order && (
          <p className="text-xs font-mono mb-6" dir="ltr" style={{ color: '#6B7280' }}>#{order.slice(0, 8).toUpperCase()}</p>
        )}
        <Link
          href={storeHref}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm mt-4"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
        >
          <ArrowLeft size={15} />
          Retour à la boutique
        </Link>
      </div>
    </div>
  )
}
