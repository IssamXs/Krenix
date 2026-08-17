'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Card from '@/components/dashboard/ui/Card'
import { STARTER_TEMPLATES } from '@/lib/site-builder/starter-templates'
import { slugify } from '@/lib/site-builder/reserved-slugs'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { SITE_BUILDER_ENABLED } from '@/lib/site-builder/feature-flag'
import SiteBuilderLocked from '@/components/site-builder/SiteBuilderLocked'

export default function NewSitePagePage() {
  const { t } = useI18n()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [templateId, setTemplateId] = useState('blank')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!SITE_BUILDER_ENABLED) {
    return <SiteBuilderLocked />
  }

  const create = async () => {
    setCreating(true)
    setError(null)
    const template = STARTER_TEMPLATES.find(t2 => t2.id === templateId) ?? STARTER_TEMPLATES[0]
    const res = await fetch('/api/site-pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, slug: slugify(title), blocks: template.build() }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? t('siteBuilder.creationError'))
      setCreating(false)
      return
    }
    router.push(`/dashboard/site-builder/${json.page.id}`)
  }

  return (
    <div className="max-w-3xl space-y-6">
      <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="dash-font-heading font-medium text-[28px] text-dash-ink">
        {t('siteBuilder.chooseTemplateTitle')}
      </motion.h1>

      <Card className="space-y-3">
        <label className="text-sm font-semibold text-dash-ink-soft">{t('siteBuilder.pageTitleLabel')}</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={t('siteBuilder.pageTitlePlaceholder')}
          className="w-full border border-dash-border rounded-lg px-3 py-2 text-sm"
        />
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {STARTER_TEMPLATES.map(template => (
          <Card
            key={template.id}
            hover
            onClick={() => setTemplateId(template.id)}
            className={`cursor-pointer ${templateId === template.id ? 'border-dash-accent' : ''}`}
          >
            <p className="text-dash-ink font-semibold">{template.label}</p>
            <p className="text-dash-ink-soft text-xs mt-1">{template.description}</p>
          </Card>
        ))}
      </div>

      {error && <p className="text-dash-danger text-sm">{error}</p>}

      <button
        type="button"
        onClick={create}
        disabled={creating || !title.trim()}
        className="px-5 py-2.5 rounded-[11px] bg-dash-accent text-dash-surface font-bold text-sm hover:bg-dash-accent-dark transition-all disabled:opacity-50"
      >
        {creating ? '…' : t('siteBuilder.newPage')}
      </button>
    </div>
  )
}
