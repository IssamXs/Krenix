import type { LandingPageContent, LandingPageSectionKey } from '@/types/database'

export function isSectionVisible(content: LandingPageContent, key: LandingPageSectionKey): boolean {
  return !content.hidden_sections?.includes(key)
}
