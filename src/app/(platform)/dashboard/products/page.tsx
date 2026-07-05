'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { Product } from '@/types/database'
import { Plus, Pencil, Trash2, Package, Search, Eye, EyeOff, Download } from 'lucide-react'

export default function ProductsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [storeId, setStoreId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const store = await resolveActiveStore(supabase, user.id, 'id') as { id: string } | null
      if (!store) { router.push('/onboarding/step-1'); return }
      setStoreId(store.id)
      fetchProducts(store.id)
    })
  }, [router])

  const fetchProducts = async (sid: string) => {
    const supabase = createClient()
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', sid)
      .order('created_at', { ascending: false })
    setProducts((data ?? []) as Product[])
    setLoading(false)
  }

  const toggleActive = async (product: Product) => {
    const supabase = createClient()
    await supabase.from('products').update({ is_active: !product.is_active }).eq('id', product.id)
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_active: !p.is_active } : p))
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce produit ? Cette action est irréversible.')) return
    setDeleting(id)
    const supabase = createClient()
    await supabase.from('products').delete().eq('id', id)
    setProducts(prev => prev.filter(p => p.id !== id))
    setDeleting(null)
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const STOCK_STATUS = (stock: number) =>
    stock === 0
      ? { label: 'Épuisé', cls: 'bg-red-500/20 text-red-400' }
      : stock <= 5
      ? { label: 'Stock limité', cls: 'bg-amber-500/20 text-amber-400' }
      : { label: 'En stock', cls: 'bg-green-500/20 text-green-400' }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Produits</h2>
          <p className="text-gray-500 text-sm mt-1">{products.length} produit{products.length !== 1 ? 's' : ''} dans votre boutique</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/products/import"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 font-semibold text-sm hover:bg-white/10 transition-all"
          >
            <Download size={16} />
            YouCan Import
          </Link>
          <Link
            href="/dashboard/products/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white font-semibold text-sm hover:opacity-90 transition-all"
          >
            <Plus size={16} />
            Ajouter un produit
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un produit..."
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#111118] border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all text-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-[#111118] border border-white/5 rounded-2xl">
          <Package size={40} className="text-gray-600" />
          <div className="text-center">
            <p className="text-gray-400 font-medium">{search ? 'Aucun résultat' : 'Aucun produit'}</p>
            <p className="text-gray-600 text-sm mt-1">{search ? 'Essayez un autre terme de recherche' : 'Ajoutez votre premier produit pour commencer à vendre'}</p>
          </div>
          {!search && (
            <Link
              href="/dashboard/products/new"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3B82F6]/10 border border-[#3B82F6]/20 text-[#3B82F6] text-sm hover:bg-[#3B82F6]/20 transition-all"
            >
              <Plus size={14} />
              Ajouter un produit
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-[#111118] border border-white/5 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {['Produit', 'Prix', 'Stock', 'Couleurs', 'Statut', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map(product => {
                  const { label, cls } = STOCK_STATUS(product.stock)
                  return (
                    <tr key={product.id} className="hover:bg-white/2 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {product.images?.[0] ? (
                            <img src={product.images[0]} alt={product.name} className="w-10 h-10 rounded-lg object-cover bg-white/5 flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                              <Package size={14} className="text-gray-600" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-white font-medium truncate max-w-[180px]">{product.name}</p>
                            <p className="text-gray-500 text-xs truncate">{product.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[#3B82F6] font-semibold whitespace-nowrap">
                        {Number(product.price).toLocaleString('fr-DZ')} DA
                        {product.compare_price && (
                          <p className="text-gray-600 text-xs line-through">{Number(product.compare_price).toLocaleString('fr-DZ')} DA</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>
                          {label} ({product.stock})
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-400 text-xs max-w-[120px] truncate">
                        {product.colors?.length > 0 ? product.colors.join(', ') : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => toggleActive(product)}
                          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium transition-all ${
                            product.is_active
                              ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                              : 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20'
                          }`}
                        >
                          {product.is_active ? <Eye size={11} /> : <EyeOff size={11} />}
                          {product.is_active ? 'Actif' : 'Masqué'}
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-1">
                          <Link
                            href={`/dashboard/products/${product.id}`}
                            className="p-2 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                          >
                            <Pencil size={14} />
                          </Link>
                          <button
                            onClick={() => handleDelete(product.id)}
                            disabled={deleting === product.id}
                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
