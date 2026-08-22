'use client'
import { useEffect } from 'react'

export default function StoreHtmlDir({ locale }: { locale: 'fr' | 'ar' }) {
  useEffect(() => {
    const html = document.documentElement
    const prevLang = html.lang
    const prevDir = html.dir
    html.lang = locale
    html.dir = locale === 'ar' ? 'rtl' : 'ltr'
    return () => {
      html.lang = prevLang
      html.dir = prevDir
    }
  }, [locale])
  return null
}
