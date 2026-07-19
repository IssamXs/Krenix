'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { Product } from '@/types/database'
import { Plus, Pencil, Trash2, Package, Search, Eye, EyeOff, Download } from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import { rowHover } from '@/lib/dashboard-motion'

export default function ProductsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchProducts = async (sid: string) => {
    const supabase = createClient()
    setLoading(true)
    const { data } = await supabase.from('products').select('*').eq('store_id', sid).order('created_at', { ascending: false })
    setProducts((data ?? []) as Product[])
    setLoading(false)
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const store = await resolveActiveStore(supabase, user.id, 'id') as { id: string } | null
      if (!store) { router.push('/onboarding/step-1'); return }
      fetchProducts(store.id)
    })
  }, [router])

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

  const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  const STOCK_STATUS = (stock: number) =>
    stock === 0 ? { label: 'Épuisé', cls: 'bg-dash-danger-soft text-dash-danger' }
    : stock <= 5 ? { label: 'Stock limité', cls: 'bg-dash-warning-soft text-dash-warning-dark' }
    : { label: 'En stock', cls: 'bg-dash-success-soft text-dash-success' }

  return (
    <div className="space-y-6 max-w-6xl">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
        <div>
          <div className="text-[11px] tracking-[0.09em] uppercase text-dash-accent font-bold">Catalogue</div>
          <h1 className="dash-font-heading font-medium text-[32px] mt-1 text-dash-ink">Produits</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/products/import"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[11px] bg-dash-surface border border-dash-border text-dash-ink-soft font-bold text-sm hover:bg-dash-surface-2 transition-all dash-font-sans"
          >
            <Download size={16} /> YouCan Import
          </Link>
          <Link
            href="/dashboard/products/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[11px] bg-dash-accent text-dash-surface font-bold text-sm hover:bg-dash-accent-dark transition-all dash-font-sans"
          >
            <Plus size={16} /> Ajouter un produit
          </Link>
        </div>
      </motion.div>

      <div className="flex gap-[28px] px-[22px] py-4 bg-dash-surface-2 rounded-2xl flex-wrap dash-font-sans">
        <div className="text-[13px]"><strong className="font-extrabold text-dash-ink">{products.filter(p => p.is_active).length}</strong> <span className="text-dash-ink-soft">produits actifs</span></div>
        <div className="w-px bg-dash-border" />
        <div className="text-[13px]"><strong className="font-extrabold text-dash-danger">{products.filter(p => p.stock === 0).length}</strong> <span className="text-dash-ink-soft">en rupture de stock</span></div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-dash-ink-faint" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un produit..."
          className="w-full pl-10 pr-4 py-3 rounded-[11px] bg-dash-surface border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm dash-font-sans"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-dash-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 gap-4">
          <Package size={40} className="text-dash-ink-faint" />
          <div className="text-center">
            <p className="text-dash-ink-soft font-medium">{search ? 'Aucun résultat' : 'Aucun produit'}</p>
            <p className="text-dash-ink-faint text-sm mt-1">{search ? 'Essayez un autre terme de recherche' : 'Ajoutez votre premier produit pour commencer à vendre'}</p>
          </div>
          {!search && (
            <Link href="/dashboard/products/new" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-dash-accent-soft text-dash-accent-dark text-sm hover:opacity-80 transition-all font-semibold">
              <Plus size={14} /> Ajouter un produit
            </Link>
          )}
        </Card>
      ) : (
        <Card padding="sm" className="overflow-hidden !p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-dash-surface-2">
                  {['Produit', 'Prix', 'Stock', 'Couleurs', 'Statut', ''].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-[11px] font-bold text-dash-ink-soft uppercase tracking-wider dash-font-sans">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((product, i) => {
                  const { label, cls } = STOCK_STATUS(product.stock)
                  return (
                    <motion.tr
                      key={product.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
                      {...rowHover}
                      className="border-t border-dash-border"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {product.images?.[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={product.images[0]} alt={product.name} loading="lazy" className="w-10 h-10 rounded-lg object-cover bg-dash-surface-2 flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-dash-surface-2 flex items-center justify-center flex-shrink-0">
                              <Package size={14} className="text-dash-ink-faint" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-dash-ink font-semibold truncate max-w-[180px]">{product.name}</p>
                            <p className="text-dash-ink-faint text-xs truncate">{product.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-dash-ink font-bold whitespace-nowrap tabular-nums">
                        {Number(product.price).toLocaleString('fr-DZ')} DA
                        {product.compare_price && (
                          <p className="text-dash-ink-faint text-xs line-through font-normal">{Number(product.compare_price).toLocaleString('fr-DZ')} DA</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cls}`}>{label} ({product.stock})</span>
                      </td>
                      <td className="px-5 py-4 text-dash-ink-soft text-xs max-w-[120px] truncate">
                        {product.colors?.length > 0 ? product.colors.join(', ') : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => toggleActive(product)}
                          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-bold transition-all ${
                            product.is_active ? 'bg-dash-success-soft text-dash-success hover:opacity-80' : 'bg-dash-surface-2 text-dash-ink-faint hover:opacity-80'
                          }`}
                        >
                          {product.is_active ? <Eye size={11} /> : <EyeOff size={11} />}
                          {product.is_active ? 'Actif' : 'Masqué'}
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-1">
                          <Link href={`/dashboard/products/${product.id}`} className="p-2 text-dash-ink-faint hover:text-dash-accent hover:bg-dash-accent-soft rounded-lg transition-colors">
                            <Pencil size={14} />
                          </Link>
                          <button
                            onClick={() => handleDelete(product.id)}
                            disabled={deleting === product.id}
                            className="p-2 text-dash-ink-faint hover:text-dash-danger hover:bg-dash-danger-soft rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
