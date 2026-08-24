'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import type { Category } from '@/types/database'

interface Props {
  value: string | null
  onChange: (categoryId: string | null) => void
}

export default function CategorySelect({ value, onChange }: Props) {
  const { t } = useI18n()
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(d => { if (!d.error) setCategories(d.categories) })
  }, [])

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === '__create__') {
      const name = window.prompt(t('productEdit.categoryCreatePrompt'))
      if (!name?.trim()) return
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (res.ok) {
        setCategories(prev => [...prev, data.category].sort((a, b) => a.name.localeCompare(b.name)))
        onChange(data.category.id)
      }
      return
    }
    onChange(e.target.value || null)
  }

  return (
    <select
      value={value ?? ''}
      onChange={handleChange}
      className="w-full px-4 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink outline-none focus:border-dash-accent/50 transition-all text-sm"
    >
      <option value="">{t('productEdit.categoryNone')}</option>
      {categories.map(c => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
      <option value="__create__">{t('productEdit.categoryCreateNew')}</option>
    </select>
  )
}
