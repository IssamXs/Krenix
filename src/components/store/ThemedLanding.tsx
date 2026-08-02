import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import LandingPageRenderer from './LandingPageRenderer'
import { THEME_TEMPLATES, type LandingProps } from './themes/registry'

export default function ThemedLanding(props: LandingProps) {
  const slug = props.store.theme?.slug
  const Template = (slug && THEME_TEMPLATES[slug]?.Landing) || LandingPageRenderer
  return (
    <>
      <Template {...props} />
      {/* `?store=` keeps the dev-only subdomain simulation working; harmless
          extra query param on production, where the subdomain alone routes home. */}
      <Link
        href={`/?store=${props.store.slug}`}
        className="fixed top-4 start-4 z-50 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold backdrop-blur-md transition-opacity hover:opacity-80"
        style={{ background: 'rgba(17,17,24,0.55)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        <ArrowLeft size={13} />
        Retour à la boutique
      </Link>
    </>
  )
}
