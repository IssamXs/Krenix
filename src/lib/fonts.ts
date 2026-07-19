// Font-name sanitization for storefront theme fonts.
//
// Store theme font names are interpolated into a raw CSS `@import url('...')`
// string that is rendered via dangerouslySetInnerHTML (StoreHomepage + the 5
// niche theme templates). Today those names come from trusted theme config, but
// stripping everything except letters/digits/spaces closes the CSS-injection
// vector defensively — legitimate Google Font names ("Poppins", "Cormorant
// Garamond", "Barlow Condensed", "Sora") are unaffected.
export function sanitizeFontName(name?: string | null): string {
  return (name ?? '').replace(/[^a-zA-Z0-9 ]/g, '').trim()
}
