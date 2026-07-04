import StoreHomepage from './StoreHomepage'
import { THEME_TEMPLATES, type StoreHomeProps } from './themes/registry'

export default function ThemedStoreHome(props: StoreHomeProps) {
  const slug = props.store.theme?.slug
  const Template = (slug && THEME_TEMPLATES[slug]?.StoreHome) || StoreHomepage
  return <Template {...props} />
}
