// ============================================================
// KRENIX — AI Product Photo Scene Director
// Single source of truth for what photos get generated and in
// what order. Used by /api/ai/landing-page/photos.
// ============================================================

import type { Plan } from '@/types/database'
import { PRO_PLANS, ULTIMATE_PLANS } from '@/types/database'

export interface PhotoScene {
  id: string
  label: string          // French, for UI skeleton labels
  prompt: string         // English scene direction appended to the preservation preamble
}

export const PHOTO_SCENES: PhotoScene[] = [
  {
    id: 'lifestyle_hero',
    label: 'Photo principale',
    prompt: 'place it in an aspirational real-world lifestyle setting that fits the product, with soft cinematic lighting, shallow depth of field and a tasteful blurred background.',
  },
  {
    id: 'studio_podium',
    label: 'Photo studio',
    prompt: 'place it centered on a premium podium / pedestal against a clean smooth gradient studio backdrop, with soft reflections and a subtle floor shadow.',
  },
  {
    id: 'in_use',
    label: "Photo d'usage",
    prompt: 'show the product naturally in use — held in a person\'s hands or being used in its real context — focus on the product, person partially framed.',
  },
  {
    id: 'detail_macro',
    label: 'Gros plan détail',
    prompt: 'an extreme close-up macro shot emphasising the material, texture, finish and build quality, with crisp focus on surface details.',
  },
  {
    id: 'feature_scene',
    label: 'Photo ambiance',
    prompt: 'a second lifestyle angle in a different environment and composition from the first, warm inviting atmosphere, product clearly the focal point.',
  },
]

export const SCENE_PRESERVATION_PREAMBLE =
  'Generate a new professional product photograph. Keep the EXACT same product shown ' +
  'in the provided image — identical shape, colors, logo, proportions and materials. ' +
  'Do NOT alter the product. Only change the scene: '

export function getPhotoCount(plan: Plan): number {
  // Photos per landing page. Basic is deliberately generous (a full one-time
  // "taste of Ultimate") because it's a 15,000 DZD one-time plan that only ever
  // generates ~1 page — the cost is paid once and it drives upgrades. Pro is
  // kept lean because it's a recurring plan generating many pages/month, so its
  // margin matters most. Image cost is ~$0.067/photo.
  if (ULTIMATE_PLANS.includes(plan)) return 5
  if (PRO_PLANS.includes(plan)) return 2
  return 5 // basic — intentional one-time taste of Ultimate quality
}

export function buildScenePrompt(scene: PhotoScene, productName: string): string {
  return `${SCENE_PRESERVATION_PREAMBLE}${scene.prompt} Product: "${productName}". ` +
    'No text, no watermarks, no graphics. Square 1:1 aspect ratio. E-commerce quality.'
}
