// Rasterise the live garden/indoor map SVG to a downloadable PNG, framed like
// a herbarium plate (paper background, hairline border, serif title + mono
// caption). Two things must be resolved before an SVG can be drawn onto a
// canvas as a standalone image:
//   1. CSS custom properties (var(--color-…)) — resolved by copying each
//      element's *computed* fill/stroke/etc onto the clone.
//   2. External <image> icons (/icons/*.svg, R2 URLs) — an SVG rendered via an
//      <img> cannot fetch external resources, so each href is inlined as a
//      data URI first. Cross-origin fetches that fail (CORS) are dropped.

const PAPER = '#F5F0E3'
const INK = '#2A3326'
const INK_SOFT = '#5C6B55'
const BORDER = '#D9CFB8'

const STYLE_PROPS = [
  'fill', 'fill-opacity', 'fill-rule',
  'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'color',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'letter-spacing',
] as const

/** Copy computed presentation styles from each source node onto the matching
 * clone node (same tree shape), so var()/class-based colours become concrete. */
function inlineComputedStyles(source: Element, clone: Element) {
  const cs = window.getComputedStyle(source)
  let style = ''
  for (const prop of STYLE_PROPS) {
    const v = cs.getPropertyValue(prop)
    if (v && v !== 'normal' && v !== 'none' || prop === 'fill' || prop === 'stroke') {
      if (v) style += `${prop}:${v};`
    }
  }
  if (style) clone.setAttribute('style', style + (clone.getAttribute('style') ?? ''))
  const sc = source.children
  const cc = clone.children
  for (let i = 0; i < sc.length && i < cc.length; i++) inlineComputedStyles(sc[i], cc[i])
}

async function toDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/** Inline every <image>'s href as a data URI (best-effort, deduped). */
async function inlineImages(clone: SVGElement) {
  const XLINK = 'http://www.w3.org/1999/xlink'
  const images = Array.from(clone.querySelectorAll('image'))
  const hrefs = new Set<string>()
  for (const img of images) {
    const h = img.getAttribute('href') || img.getAttributeNS(XLINK, 'href')
    if (h && !h.startsWith('data:')) hrefs.add(h)
  }
  const map = new Map<string, string>()
  await Promise.all([...hrefs].map(async (h) => {
    const abs = new URL(h, window.location.href).href
    const data = await toDataUri(abs)
    if (data) map.set(h, data)
  }))
  for (const img of images) {
    const h = img.getAttribute('href') || img.getAttributeNS(XLINK, 'href')
    const data = h ? map.get(h) : null
    if (data) {
      img.setAttribute('href', data)
      img.removeAttributeNS(XLINK, 'href')
    } else {
      img.remove()  // couldn't inline — drop rather than render a broken box
    }
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * Export the garden map (`svg`) as a framed PNG and trigger a download.
 * @param svg    the live map <svg>
 * @param title  garden name (serif heading)
 * @param caption mono uppercase caption under the title (e.g. "FLOREREN · VELDGIDS")
 */
export async function exportGardenPng(svg: SVGSVGElement, title: string, caption: string): Promise<void> {
  const vb = svg.viewBox.baseVal
  const mapW = vb && vb.width ? vb.width : (svg.clientWidth || 680)
  const mapH = vb && vb.height ? vb.height : (svg.clientHeight || 680)

  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.removeAttribute('style')
  clone.removeAttribute('class')
  clone.setAttribute('width', String(mapW))
  clone.setAttribute('height', String(mapH))
  clone.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  inlineComputedStyles(svg, clone)
  await inlineImages(clone)

  const xml = new XMLSerializer().serializeToString(clone)
  const svgDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<?xml version="1.0" encoding="UTF-8"?>' + xml,
  )
  const mapImg = await loadImage(svgDataUri)

  // Compose the framed plate at 2× for a crisp download.
  const SCALE = 2
  const PAD = 40
  const HEADER = 92
  const aspect = mapH / mapW
  const contentW = 900
  const contentH = Math.round(contentW * aspect)
  const outW = contentW + PAD * 2
  const outH = contentH + PAD * 2 + HEADER

  const canvas = document.createElement('canvas')
  canvas.width = outW * SCALE
  canvas.height = outH * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.scale(SCALE, SCALE)

  // Paper + hairline frame
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, outW, outH)
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 1
  ctx.strokeRect(12, 12, outW - 24, outH - 24)

  // Title + caption (Fraunces/JetBrains are already loaded on the page)
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = INK
  ctx.font = "500 34px Fraunces, Georgia, serif"
  ctx.fillText(title, PAD, 58)
  ctx.fillStyle = INK_SOFT
  ctx.font = "600 11px 'JetBrains Mono', ui-monospace, monospace"
  ctx.fillText(caption.toUpperCase(), PAD + 1, 78)

  // Map, inside a bordered inset
  const mx = PAD, my = PAD + HEADER
  ctx.strokeStyle = BORDER
  ctx.strokeRect(mx - 0.5, my - 0.5, contentW + 1, contentH + 1)
  ctx.drawImage(mapImg, mx, my, contentW, contentH)

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('toBlob failed')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.replace(/[^\w-]+/g, '-').toLowerCase() || 'garden'}-floreren.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
