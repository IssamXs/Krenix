'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { currentStoreParam } from '@/lib/onboarding'
import { Zap, ArrowRight, Package, ShoppingCart, Sparkles } from 'lucide-react'

export default function OnboardingComplete() {
  const router = useRouter()
  const [storeName, setStoreName] = useState('')
  const [storeSlug, setStoreSlug] = useState('')
  const [needsActivation, setNeedsActivation] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const storeId = currentStoreParam()
      const query = storeId
        ? supabase.from('stores').select('name, slug, subscription_status').eq('id', storeId).maybeSingle()
        : supabase.from('stores').select('name, slug, subscription_status').eq('owner_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      query.then(({ data }) => {
        if (data) {
          setStoreName(data.name)
          setStoreSlug(data.slug)
          setNeedsActivation(data.subscription_status !== 'active')
        }
      })
    })
  }, [])

  const NEXT_STEPS = [
    { icon: Package, title: 'Gérer vos produits', desc: 'Ajoutez photos, variantes et stocks', href: '/dashboard/products' },
    { icon: ShoppingCart, title: 'Suivre vos commandes', desc: 'Visualisez et gérez vos ventes', href: '/dashboard/orders' },
    { icon: Sparkles, title: 'Générer avec l\'IA', desc: 'Créez des landing pages qui convertissent', href: '/dashboard/pages/new' },
  ]

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-73px)] px-4 py-12 text-center">
      {/* Success animation */}
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-3xl bg-dash-accent flex items-center justify-center shadow-2xl shadow-dash-accent/30 mx-auto">
          <Zap size={40} className="text-white" fill="white" />
        </div>
        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-dash-success flex items-center justify-center shadow-lg">
          <span className="text-white text-lg">✓</span>
        </div>
      </div>

      <h1 className="dash-font-heading text-3xl font-medium text-dash-ink mb-2">Votre boutique est prête !</h1>
      {storeName && (
        <p className="text-dash-ink-soft mb-2">
          <span className="text-dash-accent font-semibold">{storeName}</span> est maintenant en ligne.
        </p>
      )}
      {storeSlug && (
        <p className="text-sm text-dash-ink-faint mb-10">
          Adresse : <span className="text-dash-ink-soft">{storeSlug}.krenix.store</span>
        </p>
      )}

      {needsActivation ? (
        <>
          <div className="w-full max-w-md bg-dash-surface border border-dash-border rounded-xl p-4 mb-8 text-left">
            <p className="text-dash-ink text-sm font-medium">Plus qu&apos;une étape</p>
            <p className="text-dash-ink-faint text-xs mt-1">
              Activez votre boutique pour accéder à votre tableau de bord, générer vos landing pages et recevoir des commandes.
            </p>
          </div>
          <button
            onClick={() => router.push('/activate')}
            className="flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-sm text-white bg-dash-accent transition-all hover:bg-dash-accent-dark hover:shadow-lg hover:shadow-dash-accent/20"
          >
            Activer ma boutique
            <ArrowRight size={16} />
          </button>
        </>
      ) : (
        <>
          {/* Next steps */}
          <div className="w-full max-w-md space-y-3 mb-8">
            {NEXT_STEPS.map(({ icon: Icon, title, desc, href }) => (
              <button
                key={href}
                onClick={() => router.push(href)}
                className="w-full flex items-center gap-4 p-4 bg-dash-surface border border-dash-border rounded-xl hover:border-dash-ink-faint transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-dash-accent-soft border border-dash-accent/20 flex items-center justify-center flex-shrink-0 group-hover:bg-dash-accent/20 transition-all">
                  <Icon size={18} className="text-dash-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-dash-ink text-sm font-medium">{title}</p>
                  <p className="text-dash-ink-faint text-xs mt-0.5">{desc}</p>
                </div>
                <ArrowRight size={16} className="text-dash-ink-faint group-hover:text-dash-ink-soft transition-colors" />
              </button>
            ))}
          </div>

          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-sm text-white bg-dash-accent transition-all hover:bg-dash-accent-dark hover:shadow-lg hover:shadow-dash-accent/20"
          >
            Accéder au tableau de bord
            <ArrowRight size={16} />
          </button>
        </>
      )}
    </div>
  )
}
