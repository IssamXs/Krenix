import { useState } from 'react'
import { colorForImage, imageIndexForColor } from './variants'

export interface ProductPhotoColorSync {
  activeIndex: number
  setActiveIndex: (index: number) => void
  selectedColor: string
  selectColor: (color: string) => void
}

// Two-way binding between a product's photo gallery and its color swatches:
// clicking a photo tagged with a color selects that color, and picking a
// color jumps the gallery to the first photo tagged with it. Untagged photos
// (lifestyle/generic shots) don't affect the selected color, and a color with
// no tagged photo just leaves the gallery where it was.
export function useProductPhotoColorSync(
  images: string[],
  imageColors: Record<string, string>,
  initialColor: string,
): ProductPhotoColorSync {
  const [activeIndex, setActiveIndexRaw] = useState(() => {
    const idx = imageIndexForColor(images, imageColors, initialColor)
    return idx !== -1 ? idx : 0
  })
  const [selectedColor, setSelectedColor] = useState(initialColor)

  const setActiveIndex = (index: number) => {
    setActiveIndexRaw(index)
    const tag = colorForImage(images, imageColors, index)
    if (tag) setSelectedColor(tag)
  }

  const selectColor = (color: string) => {
    setSelectedColor(color)
    const idx = imageIndexForColor(images, imageColors, color)
    if (idx !== -1) setActiveIndexRaw(idx)
  }

  return { activeIndex, setActiveIndex, selectedColor, selectColor }
}
