import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function BackToHomeLink({ label }: { label: string }) {
  return (
    <Link
      href="/"
      className="absolute top-4 start-4 z-10 inline-flex items-center gap-1.5 text-sm font-medium text-dash-ink-soft hover:text-dash-ink transition-colors"
    >
      <ArrowLeft size={15} className="rtl:rotate-180" />
      {label}
    </Link>
  )
}
