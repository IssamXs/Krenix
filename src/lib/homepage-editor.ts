import type { HomepageEditorSettings, StoreSettings } from '@/types/database'

// Canonical homepage sections. `id` is the key stored in settings.homepage.sections;
// `label` is the merchant-facing name shown in the Pro-édition panel.
export const HOMEPAGE_SECTIONS: { id: string; label: string; hint: string }[] = [
  { id: 'announcement', label: 'Bandeau annonce', hint: 'Mini-bandeau tout en haut' },
  { id: 'banner', label: 'Bannière boutique', hint: 'Image de couverture (si définie)' },
  { id: 'hero', label: 'Héro', hint: 'Titre + image principale' },
  { id: 'collections', label: 'Collections', hint: 'Cartes de catégories' },
  { id: 'campaigns', label: 'Campagnes', hint: 'Pages de vente publiées' },
  { id: 'products', label: 'Catalogue produits', hint: 'La grille de produits' },
  { id: 'promo', label: 'Bandeau promo', hint: 'Produit en promotion' },
  { id: 'values', label: 'Valeurs', hint: 'Pourquoi nous choisir' },
  { id: 'footer', label: 'Pied de page', hint: 'Liens + réseaux sociaux' },
]

const DEFAULT_SECTIONS: Record<string, boolean> = Object.fromEntries(
  HOMEPAGE_SECTIONS.map(s => [s.id, true]),
)

// Default = everything visible, no swipe, no auto-catalog. Matches the current
// storefront behaviour so existing stores are untouched until they opt in.
export const DEFAULT_HOMEPAGE_EDITOR: HomepageEditorSettings = {
  sections: DEFAULT_SECTIONS,
  photoSwipe: false,
  autoCatalog: false,
}

export function getHomepageEditor(settings?: StoreSettings | null): HomepageEditorSettings {
  const hp = settings?.homepage
  return {
    sections: { ...DEFAULT_SECTIONS, ...(hp?.sections ?? {}) },
    photoSwipe: hp?.photoSwipe ?? false,
    autoCatalog: hp?.autoCatalog ?? false,
  }
}
