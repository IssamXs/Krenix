'use client'

import { useEffect, useState } from 'react'
import { Tag, Plus, Loader2, Trash2 } from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import type { Category } from '@/types/database'

export default function CategoriesPage() {
  const { t } = useI18n()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const refresh = async () => {
    const res = await fetch('/api/categories')
    const data = await res.json()
    if (!data.error) setCategories(data.categories)
  }

  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(d => { if (!d.error) setCategories(d.categories); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const create = async () => {
    if (!name.trim()) return
    setCreating(true); setError('')
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? t('categoriesPage.errorGeneric')); return }
      setName('')
      await refresh()
    } finally {
      setCreating(false)
    }
  }

  const remove = async (category: Category) => {
    if (!confirm(t('categoriesPage.deleteConfirm', { name: category.name }))) return
    setDeletingId(category.id)
    await fetch('/api/categories', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: category.id }),
    })
    setDeletingId(null)
    await refresh()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="animate-spin text-dash-accent" size={26} />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">{t('categoriesPage.title')}</h1>
        <p className="text-dash-ink-soft text-sm mt-1">{t('categoriesPage.subtitle')}</p>
      </div>

      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Tag size={16} className="text-dash-accent" />
          <h3 className="text-dash-ink font-bold text-sm">{t('categoriesPage.createButton')}</h3>
        </div>
        {error && <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-xl">{error}</div>}
        <div className="flex gap-2">
          <input
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) create() }}
            placeholder={t('categoriesPage.createPlaceholder')}
            className="flex-1 px-4 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm"
          />
          <button
            onClick={create}
            disabled={creating || !name.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dash-accent hover:bg-dash-accent-dark text-dash-surface font-bold text-sm transition-all disabled:opacity-50 flex-shrink-0"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {t('categoriesPage.createButton')}
          </button>
        </div>
      </Card>

      <Card padding="sm" className="divide-y divide-dash-border">
        {categories.length === 0 ? (
          <div className="py-10 text-center space-y-1">
            <p className="text-dash-ink font-semibold text-sm">{t('categoriesPage.emptyTitle')}</p>
            <p className="text-dash-ink-faint text-xs">{t('categoriesPage.emptyHint')}</p>
          </div>
        ) : (
          categories.map(category => (
            <div key={category.id} className="flex items-center justify-between py-3 px-2 first:pt-1 last:pb-1">
              <span className="text-dash-ink text-sm font-medium">{category.name}</span>
              <button
                onClick={() => remove(category)}
                disabled={deletingId === category.id}
                className="p-2 rounded-lg text-dash-ink-faint hover:text-dash-danger hover:bg-dash-danger-soft transition-all disabled:opacity-50"
              >
                {deletingId === category.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          ))
        )}
      </Card>
    </div>
  )
}
