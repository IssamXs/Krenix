'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Zap, ArrowRight, Package, ShoppingCart, Sparkles } from 'lucide-react'

export default function OnboardingComplete() {
  const router = useRouter()
  const [storeName, setStoreName] = useState('')
  const [storeSlug, setStoreSlug] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('stores').select('name, slug').eq('owner_id', user.id).single().then(({ data }) => {
        if (data) {
          setStoreName(data.name)
          setStoreSlug(data.slug)
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
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#3B82F6] to-[#2563EB] flex items-center justify-center shadow-2xl shadow-[#3B82F6]/30 mx-auto">
          <Zap size={40} className="text-black" fill="black" />
        </div>
        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
          <span className="text-white text-lg">✓</span>
        </div>
      </div>

      <h1 className="text-3xl font-bold text-white mb-2">Votre boutique est prête !</h1>
      {storeName && (
        <p className="text-gray-400 mb-2">
          <span className="text-[#3B82F6] font-semibold">{storeName}</span> est maintenant en ligne.
        </p>
      )}
      {storeSlug && (
        <p className="text-sm text-gray-500 mb-10">
          Adresse : <span className="text-gray-300">{storeSlug}.novalux.com</span>
        </p>
      )}

      {/* Next steps */}
      <div className="w-full max-w-md space-y-3 mb-8">
        {NEXT_STEPS.map(({ icon: Icon, title, desc, href }) => (
          <button
            key={href}
            onClick={() => router.push(href)}
            className="w-full flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-xl hover:border-white/20 hover:bg-white/8 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#3B82F6]/10 border border-[#3B82F6]/20 flex items-center justify-center flex-shrink-0 group-hover:bg-[#3B82F6]/20 transition-all">
              <Icon size={18} className="text-[#3B82F6]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium">{title}</p>
              <p className="text-gray-500 text-xs mt-0.5">{desc}</p>
            </div>
            <ArrowRight size={16} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
          </button>
        ))}
      </div>

      <button
        onClick={() => router.push('/dashboard')}
        className="flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-black transition-all hover:opacity-90 hover:shadow-lg hover:shadow-[#3B82F6]/20"
      >
        Accéder au tableau de bord
        <ArrowRight size={16} />
      </button>
    </div>
  )
}
