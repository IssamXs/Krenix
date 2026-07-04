import LandingPageRenderer from './LandingPageRenderer'
import { THEME_TEMPLATES, type LandingProps } from './themes/registry'

export default function ThemedLanding(props: LandingProps) {
  const slug = props.store.theme?.slug
  const Template = (slug && THEME_TEMPLATES[slug]?.Landing) || LandingPageRenderer
  return <Template {...props} />
}
