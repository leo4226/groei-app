/** Downscale + recompress a photo client-side before upload.
 *  Long edge ≤ 1600 px, JPEG q0.8 → typically 200–400 KB, which keeps the
 *  whole journal inside R2's free tier (~30k photos in 10 GB). */
const MAX_EDGE = 1600
const QUALITY = 0.8

export async function compressImage(file: File): Promise<Blob> {
  // from-image: respects EXIF orientation so phone photos aren't sideways
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file  // ancient browser: upload original
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY)
  )
  return blob ?? file
}
