// ============================================================
// Client-side product photo compression (dashboard uploads).
//
// WHY: merchants upload straight from a phone or a supplier's site, so product
// photos routinely land at 2-4 MB / 2400px+. Nothing ever renders them that
// large — the storefront tops out around 1600px via next/image, and the
// dashboard's own photo grid uses a plain <img>, so it downloads every
// original at full size (a product with 8 photos was pulling ~22 MB).
// Shrinking at upload time fixes storage, the image-optimizer cold path, and
// the editor all at once.
// ============================================================

export const MAX_UPLOAD_DIMENSION = 1600
export const UPLOAD_JPEG_QUALITY = 0.82

// Photos already at or below this are left untouched — re-encoding a small
// file usually makes it bigger, not smaller.
const SKIP_BELOW_BYTES = 600_000

/**
 * Longest-edge-constrained scale, preserving aspect ratio. Never upscales.
 * Returns whole pixels, since canvas dimensions must be integers.
 */
export function fitDimensions(
  width: number,
  height: number,
  maxDim: number,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0) || !(maxDim > 0)) return { width: 0, height: 0 }
  const scale = Math.min(1, maxDim / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** True when re-encoding this file is worth attempting at all. */
export function shouldCompress(type: string, size: number, width: number, height: number): boolean {
  if (!type.startsWith('image/')) return false
  // A canvas round-trip rasterises vectors and drops every frame but the first.
  if (type === 'image/svg+xml' || type === 'image/gif') return false
  return size > SKIP_BELOW_BYTES || Math.max(width, height) > MAX_UPLOAD_DIMENSION
}

/**
 * Downscale + re-encode a photo for upload. Falls back to the original file on
 * any failure, or whenever the re-encoded result isn't actually smaller — an
 * upload that works is always better than a compression that saves bytes.
 */
export async function compressImage(
  file: File,
  maxDim: number = MAX_UPLOAD_DIMENSION,
  quality: number = UPLOAD_JPEG_QUALITY,
): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  try {
    if (!shouldCompress(file.type, file.size, bitmap.width, bitmap.height)) return file

    const { width, height } = fitDimensions(bitmap.width, bitmap.height, maxDim)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (!blob || blob.size >= file.size) return file

    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } catch {
    return file
  } finally {
    bitmap.close()
  }
}
