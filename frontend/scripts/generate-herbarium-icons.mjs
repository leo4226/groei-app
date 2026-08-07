// Draws the remaining plant-picker icons in the herbarium hand-drawn style.
//
//   node scripts/generate-herbarium-icons.mjs
//
// Writes public/icons/<id>.svg and adds/updates the manifest entries.
//
// Why not routers/icon_generator.py: that generator picks a shape from a broad
// category, and 18 of these 22 plants are `vaste_plant`, so they would all come
// out as the same broadleaf silhouette. The picker renders icons at 32px, where
// silhouette and dominant colour are the only things that read — so each recipe
// below is built from the plant's actual habit (torch, umbel, plume, spike,
// rosette, truss …) rather than its database category.
//
// The primitives mirror the existing hand-drawn icons (hosta.svg, zonnehoed.svg,
// silvergrass.svg): 100x100 viewBox, dashed ground line, leaves as rotated
// groups around a base point, pale midribs, flat fills.

import { writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ICONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

// ── Palette (from the existing icons) ────────────────────────────────────
const LEAF_DARK = '#2F5D3A'
const LEAF_MID = '#4A7C4E'
const LEAF_LIGHT = '#5C8A4E'
const LEAF_GREY = '#7C8F72'
const VEIN = '#C9DDB4'
const STEM = '#3D5C3A'
const GROUND = '#6B4A35'

// ── Primitives ───────────────────────────────────────────────────────────

const ground = () =>
  `<path d="M 22 92 Q 50 90 78 92" stroke="${GROUND}" stroke-width="0.8" fill="none" opacity="0.3" stroke-dasharray="1.5 2"/>`

const stem = (x1, y1, x2, y2, w = 1.3, color = STEM) =>
  `<path d="M ${x1} ${y1} Q ${(x1 + x2) / 2 - 1} ${(y1 + y2) / 2} ${x2} ${y2}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`

/** Leaf blade shapes, drawn upright from (0,0) so they can be rotated. */
const BLADES = {
  broad: 'M 0 0 Q -15 -9 -15 -30 Q -9 -41 0 -39 Q 9 -41 15 -30 Q 15 -9 0 0 Z',
  heart: 'M 0 0 Q -14 -8 -14 -24 Q -14 -35 -5 -34 Q 0 -33 0 -28 Q 0 -33 5 -34 Q 14 -35 14 -24 Q 14 -8 0 0 Z',
  lance: 'M 0 0 Q -6 -14 -5 -30 Q -3 -40 0 -41 Q 3 -40 5 -30 Q 6 -14 0 0 Z',
  sword: 'M 0 0 Q -3.5 -20 -2.5 -44 Q -1.2 -54 0 -55 Q 1.2 -54 2.5 -44 Q 3.5 -20 0 0 Z',
  lobed: 'M 0 0 Q -13 -6 -15 -18 Q -18 -27 -9 -27 Q -11 -35 -3 -33 Q 0 -38 3 -33 Q 11 -35 9 -27 Q 18 -27 15 -18 Q 13 -6 0 0 Z',
  palmate: 'M 0 0 Q -4 -14 -14 -22 Q -18 -26 -13 -29 Q -6 -30 -3 -24 Q -5 -33 0 -37 Q 5 -33 3 -24 Q 6 -30 13 -29 Q 18 -26 14 -22 Q 4 -14 0 0 Z',
  succulent: 'M 0 0 Q -8 -6 -8 -17 Q -8 -25 0 -26 Q 8 -25 8 -17 Q 8 -6 0 0 Z',
  leathery: 'M 0 0 Q -8 -10 -7 -28 Q -5 -37 0 -38 Q 5 -37 7 -28 Q 8 -10 0 0 Z',
}

function leaf(blade, { x = 50, y = 88, rot = 0, scale = 1, fill = LEAF_MID, vein = true } = {}) {
  const midrib = vein
    ? `<path d="M 0 -3 L 0 -30" stroke="${VEIN}" stroke-width="0.8" stroke-linecap="round" opacity="0.8"/>`
    : ''
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${scale})"><path d="${BLADES[blade]}" fill="${fill}"/>${midrib}</g>`
}

/** A fan of leaves round a base point — the hosta.svg construction. */
function rosette(blade, { x = 50, y = 88, count = 6, spread = 62, scale = 1, colors = [LEAF_DARK, LEAF_MID] } = {}) {
  const out = []
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1)
    const rot = -spread + t * spread * 2
    const s = scale * (0.85 + 0.3 * Math.sin(t * Math.PI))
    out.push(leaf(blade, { x, y, rot, scale: +s.toFixed(2), fill: colors[i % colors.length] }))
  }
  return out.join('')
}

const dot = (x, y, r, fill, opacity = 1) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"${opacity < 1 ? ` opacity="${opacity}"` : ''}/>`

const oval = (x, y, rx, ry, fill, rot = 0) =>
  `<ellipse cx="0" cy="0" rx="${rx}" ry="${ry}" fill="${fill}" transform="translate(${x} ${y}) rotate(${rot})"/>`

/** Whorled flower spike (Salvia, Nepeta, Veronica). */
function spike(x, yBase, yTop, color, { width = 4, steps = 7, dotR = 1.9 } = {}) {
  const out = [stem(x, yBase, x, yTop, 1.1)]
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const y = yBase - (yBase - yTop) * t
    const w = width * (1 - t * 0.55)
    out.push(dot(x - w, y, dotR, color), dot(x + w, y, dotR, color), dot(x, y - dotR, dotR * 0.8, color, 0.85))
  }
  return out.join('')
}

/** Feathery panicle (Astilbe) — a tapered body so it reads as a plume, not
 *  a stack of chevrons, once the icon is scaled down to 32px. */
function plume(x, yBase, yTop, color) {
  const h = yBase - yTop
  const w = 7.5
  const body = `<path d="M ${x} ${yTop - 2} Q ${x - w} ${yTop + h * 0.45} ${x - w * 0.55} ${yBase} Q ${x} ${yBase + 2} ${x + w * 0.55} ${yBase} Q ${x + w} ${yTop + h * 0.45} ${x} ${yTop - 2} Z" fill="${color}"/>`
  const out = [stem(x, yBase + 4, x, yBase - 2, 1.1), body]
  for (let i = 0; i < 7; i++) {
    const t = 0.1 + (i / 6) * 0.85
    const y = yTop + h * t
    const ww = w * (0.45 + t * 0.75)
    out.push(`<path d="M ${x} ${y.toFixed(1)} Q ${(x - ww * 0.7).toFixed(1)} ${(y + 1).toFixed(1)} ${(x - ww).toFixed(1)} ${(y + 4).toFixed(1)}" stroke="${color}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.9"/>`)
    out.push(`<path d="M ${x} ${y.toFixed(1)} Q ${(x + ww * 0.7).toFixed(1)} ${(y + 1).toFixed(1)} ${(x + ww).toFixed(1)} ${(y + 4).toFixed(1)}" stroke="${color}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.9"/>`)
  }
  return out.join('')
}

/** Flat-topped head of tiny florets (Astrantia, Sedum, Verbena, Phlox). */
function umbel(x, y, color, { r = 7, n = 11, dotR = 1.7, dome = 0 } = {}) {
  const out = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const px = x + Math.cos(a) * r * (0.55 + 0.45 * ((i % 3) / 2))
    const py = y + Math.sin(a) * r * 0.42 - dome * Math.abs(Math.cos(a))
    out.push(dot(+px.toFixed(1), +py.toFixed(1), dotR, color))
  }
  out.push(dot(x, y - dome * 0.4, dotR * 1.15, color))
  return out.join('')
}

/** Simple round flower with petals (Anemone, Rose, Rudbeckia). */
function bloom(x, y, { r = 6, petals = 7, petal = '#E8A0BC', centre = '#E4B84A', centreR = 2.2 } = {}) {
  const out = []
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2
    out.push(oval(+(x + Math.cos(a) * r * 0.62).toFixed(1), +(y + Math.sin(a) * r * 0.62).toFixed(1), r * 0.52, r * 0.34, petal, +((a * 180) / Math.PI).toFixed(0)))
  }
  out.push(dot(x, y, centreR, centre))
  return out.join('')
}

/** Nodding bell/cup (Helleborus). */
const cup = (x, y, color, edge, r = 6) =>
  `<path d="M ${x - r} ${y} Q ${x - r} ${y + r * 1.1} ${x} ${y + r * 1.15} Q ${x + r} ${y + r * 1.1} ${x + r} ${y} Q ${x} ${y - r * 0.55} ${x - r} ${y} Z" fill="${color}"/>` +
  `<path d="M ${x - r * 0.55} ${y + r * 0.15} Q ${x} ${y + r * 0.55} ${x + r * 0.55} ${y + r * 0.15}" stroke="${edge}" stroke-width="0.8" fill="none" opacity="0.75"/>`

/** Dense poker (Kniphofia). */
function torch(x, yBase, yTop, hot, cool) {
  const h = yBase - yTop
  return (
    stem(x, yBase, yTop + h * 0.15, 1.4) +
    `<path d="M ${x - 5} ${yTop + h * 0.62} Q ${x - 6} ${yTop} ${x} ${yTop - 3} Q ${x + 6} ${yTop} ${x + 5} ${yTop + h * 0.62} Q ${x} ${yTop + h * 0.78} ${x - 5} ${yTop + h * 0.62} Z" fill="${cool}"/>` +
    `<path d="M ${x - 4.2} ${yTop + h * 0.34} Q ${x - 5} ${yTop + 1} ${x} ${yTop - 2} Q ${x + 5} ${yTop + 1} ${x + 4.2} ${yTop + h * 0.34} Q ${x} ${yTop + h * 0.48} ${x - 4.2} ${yTop + h * 0.34} Z" fill="${hot}"/>`
  )
}

/** Bottlebrush plume (Pennisetum). */
function bottlebrush(x, yBase, yTop, color, tilt = 0) {
  const out = [`<path d="M ${x} ${yBase} Q ${x + tilt * 0.4} ${(yBase + yTop) / 2} ${x + tilt} ${yTop}" stroke="${STEM}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`]
  const h = yBase - yTop
  for (let i = 0; i < 10; i++) {
    const t = i / 9
    const px = x + tilt * t
    const py = yBase - h * t
    const w = 4.5 * Math.sin(t * Math.PI) + 1.2
    out.push(`<path d="M ${px.toFixed(1)} ${py.toFixed(1)} l ${-w.toFixed(1)} -2.5 M ${px.toFixed(1)} ${py.toFixed(1)} l ${w.toFixed(1)} -2.5" stroke="${color}" stroke-width="1.2" stroke-linecap="round"/>`)
  }
  return out.join('')
}

/** Very fine hair-like blades (Nassella). */
function hairTuft(x, yBase, color, { n = 15, h = 46, spread = 26 } = {}) {
  const out = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5
    const tipX = x + t * spread * 2
    const tipY = yBase - h * (0.65 + 0.35 * Math.cos(t * Math.PI))
    out.push(`<path d="M ${x} ${yBase} Q ${(x + tipX) / 2 - t * 6} ${(yBase + tipY) / 2} ${tipX.toFixed(1)} ${tipY.toFixed(1)}" stroke="${color}" stroke-width="0.9" fill="none" stroke-linecap="round" opacity="0.9"/>`)
  }
  return out.join('')
}

/** Airy cloud of tiny florets on thin stems (Thalictrum). */
function haze(x, yBase, yTop, color) {
  const out = []
  const pts = [[-16, 8], [-9, 1], [-2, -5], [5, -2], [12, 3], [17, 10], [-12, 14], [-4, 11], [4, 12], [12, 15], [-7, 21], [2, 20], [9, 22], [0, 6]]
  for (const [dx, dy] of pts) {
    out.push(stem(x, yBase, x + dx * 0.6, yTop + dy, 0.7))
    out.push(dot(x + dx * 0.6, yTop + dy, 2.4, color, 0.92))
    out.push(dot(x + dx * 0.6 + 2.2, yTop + dy + 2.2, 1.5, color, 0.62))
  }
  return out.join('')
}

/** Fern frond — a rachis with pinnae, denser/lacier than malefern's. */
function frond(x, yBase, rot, len, color, lacy) {
  const out = [`<g transform="translate(${x} ${yBase}) rotate(${rot})">`]
  out.push(`<path d="M 0 0 Q 1 ${-len * 0.5} 0 ${-len}" stroke="${color}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`)
  const n = lacy ? 11 : 8
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1)
    const y = -len * t
    const w = (lacy ? 9 : 11) * Math.sin(t * Math.PI) + 1.5
    const droop = lacy ? 3.5 : 2
    out.push(`<path d="M 0 ${y.toFixed(1)} Q ${(-w * 0.6).toFixed(1)} ${(y + droop * 0.3).toFixed(1)} ${(-w).toFixed(1)} ${(y + droop).toFixed(1)}" stroke="${color}" stroke-width="${lacy ? 1.1 : 1.6}" fill="none" stroke-linecap="round"/>`)
    out.push(`<path d="M 0 ${y.toFixed(1)} Q ${(w * 0.6).toFixed(1)} ${(y + droop * 0.3).toFixed(1)} ${w.toFixed(1)} ${(y + droop).toFixed(1)}" stroke="${color}" stroke-width="${lacy ? 1.1 : 1.6}" fill="none" stroke-linecap="round"/>`)
  }
  out.push('</g>')
  return out.join('')
}

// ── Recipes ──────────────────────────────────────────────────────────────
// [id, dutch, latin, category, family, draw()]

const RECIPES = [
  ['epimedium', 'Elfenbloem', 'Epimedium × perralchicum', 'flower', 'Berberidaceae', () =>
    rosette('heart', { count: 5, spread: 55, scale: 1.05, colors: ['#3C6B42', '#6E8F52'] }) +
    [30, 50, 70].map((x, i) => stem(x, 86, x + (i - 1) * 4, 34 + i * 3, 0.8)).join('') +
    [[26, 34], [50, 30], [74, 40]].map(([x, y]) => bloom(x, y, { r: 4.6, petals: 4, petal: '#F0D060', centre: '#E8B23A', centreR: 1.4 })).join('')],

  ['pachysandra', 'Schaduwgroen', 'Pachysandra terminalis', 'houseplant', 'Buxaceae', () =>
    rosette('lobed', { count: 7, spread: 72, scale: 0.92, colors: [LEAF_DARK, '#3E7042'] }) +
    [36, 50, 64].map((x, i) => spike(x, 60, 36 - i % 2 * 4, '#FAF7EC', { width: 3, steps: 5, dotR: 2.1 })).join('')],

  ['helleborus', 'Kerstroos', 'Helleborus orientalis', 'flower', 'Ranunculaceae', () =>
    rosette('palmate', { count: 5, spread: 64, scale: 1.1, colors: [LEAF_DARK, '#3A6B41'] }) +
    stem(38, 86, 34, 44) + stem(50, 86, 52, 34) + stem(64, 86, 68, 46) +
    cup(33, 42, '#EDE7F1', '#B9A8C6', 7.5) + cup(52, 30, '#F7F3F8', '#B9A8C6', 8.5) + cup(69, 45, '#DCCFE2', '#A793B4', 7)],

  ['pulmonaria', 'Longkruid', 'Pulmonaria officinalis', 'flower', 'Boraginaceae', () => {
    const spots = [[36, 70], [44, 62], [60, 66], [66, 74], [40, 78]]
    return rosette('lance', { count: 7, spread: 70, scale: 1.15, colors: ['#3F6E45', '#57814F'] }) +
      spots.map(([x, y]) => dot(x, y, 1.5, '#CFE0BC', 0.85)).join('') +
      stem(50, 84, 48, 40) + stem(50, 84, 60, 46) +
      [[44, 38, '#8A7CC8'], [52, 34, '#D48AB4'], [62, 44, '#8A7CC8'], [56, 42, '#D48AB4']]
        .map(([x, y, c]) => dot(x, y, 3, c)).join('')
  }],

  ['astrantia', 'Astrantia', 'Astrantia major', 'flower', 'Apiaceae', () =>
    rosette('palmate', { count: 5, spread: 66, scale: 0.95, colors: ['#41724A', LEAF_MID] }) +
    stem(50, 88, 34, 40, 0.9) + stem(50, 88, 52, 28, 0.9) + stem(50, 88, 68, 44, 0.9) +
    umbel(34, 40, '#EBE0EA', { r: 7.5, n: 10, dotR: 2.3, dome: 1.5 }) +
    umbel(52, 26, '#F6F0F5', { r: 8.5, n: 12, dotR: 2.5, dome: 2 }) +
    umbel(68, 44, '#DDCBDA', { r: 7, n: 10, dotR: 2.2, dome: 1.5 })],

  ['heuchera', 'Heuchera', 'Heuchera sanguinea', 'flower', 'Saxifragaceae', () =>
    rosette('lobed', { count: 7, spread: 78, scale: 1.12, colors: ['#7B3F52', '#9A5468', '#6A3547'] }) +
    [36, 50, 64].map((x, i) => stem(x, 66, x + (i - 1) * 6, 24 + i * 4, 0.7)).join('') +
    [[30, 28], [50, 24], [70, 32]].flatMap(([x, y]) =>
      [0, 1, 2, 3].map((k) => dot(x + (k % 2 ? 2.5 : -2.5), y + k * 5, 1.6, '#E8607F', 0.95))).join('')],

  ['tiarella', 'Tiarella', 'Tiarella cordifolia', 'flower', 'Saxifragaceae', () =>
    rosette('lobed', { count: 6, spread: 70, scale: 1.0, colors: ['#47784B', '#63915A'] }) +
    [36, 50, 64].map((x, i) => spike(x, 66, 26 + i * 4, '#FAF7EC', { width: 3.4, steps: 7, dotR: 2.1 })).join('')],

  ['rhododendron', 'Rododendron', 'Rhododendron (hybride)', 'shrub', 'Ericaceae', () =>
    rosette('leathery', { count: 7, spread: 74, scale: 1.15, colors: ['#28513A', '#356544'] }) +
    [[42, 36], [58, 36], [50, 27], [42, 46], [58, 46], [50, 38]]
      .map(([x, y], i) => bloom(x, y, { r: i > 2 ? 5.5 : 6.5, petals: 5, petal: i % 2 ? '#D4699C' : '#E081AE', centre: '#F4D9E6', centreR: 1.6 })).join('')],

  ['anemone_japanese', 'Japanse anemoon', 'Anemone hybrida', 'flower', 'Ranunculaceae', () =>
    rosette('palmate', { count: 5, spread: 60, scale: 0.9, colors: [LEAF_DARK, LEAF_MID] }) +
    stem(50, 88, 36, 32) + stem(50, 88, 54, 20) + stem(50, 88, 68, 38) +
    bloom(36, 32, { r: 7, petals: 6, petal: '#E497B8', centre: '#E8C860', centreR: 2.4 }) +
    bloom(54, 20, { r: 8, petals: 6, petal: '#EFAFC9', centre: '#E8C860', centreR: 2.6 }) +
    bloom(68, 38, { r: 6, petals: 6, petal: '#D986AC', centre: '#E8C860', centreR: 2 })],

  ['astilbe', 'Pluimspirea', 'Astilbe × arendsii', 'flower', 'Saxifragaceae', () =>
    rosette('palmate', { count: 5, spread: 62, scale: 0.85, colors: ['#3B6B42', LEAF_MID] }) +
    plume(36, 76, 40, '#E58BAE') + plume(52, 78, 28, '#F0A6C2') + plume(66, 76, 44, '#D2708F')],

  ['persicaria', 'Duizendknoop', 'Persicaria amplexicaulis', 'flower', 'Polygonaceae', () =>
    rosette('lance', { count: 6, spread: 66, scale: 1.05, colors: ['#3F6E45', '#55804E'] }) +
    [[34, 40], [50, 30], [66, 44]].map(([x, y]) =>
      stem(x, 80, x, y, 1) +
      `<path d="M ${x - 2} ${y + 14} Q ${x - 2.6} ${y} ${x} ${y - 3} Q ${x + 2.6} ${y} ${x + 2} ${y + 14} Z" fill="#B8354C"/>`).join('')],

  ['anemone_autumn', 'Herfstanemoon', 'Anemone hupehensis', 'flower', 'Ranunculaceae', () =>
    rosette('palmate', { count: 5, spread: 58, scale: 0.88, colors: ['#35643E', '#4E8050'] }) +
    stem(50, 88, 40, 38) + stem(50, 88, 62, 30) +
    bloom(40, 38, { r: 7, petals: 5, petal: '#F5EDF0', centre: '#E0BC55', centreR: 2.4 }) +
    bloom(62, 30, { r: 7.5, petals: 5, petal: '#EAD8E0', centre: '#E0BC55', centreR: 2.5 })],

  ['crocosmia', 'Montbretia', "Crocosmia 'Lucifer'", 'bulb', 'Iridaceae', () =>
    [-26, -12, 4, 18].map((r, i) => leaf('sword', { rot: r, scale: 0.95 + i * 0.04, fill: i % 2 ? '#4A7C4E' : '#3C6B42' })).join('') +
    `<path d="M 50 82 Q 54 50 74 34" stroke="${STEM}" stroke-width="1.4" fill="none" stroke-linecap="round"/>` +
    [[58, 54], [64, 46], [70, 39], [75, 33]].map(([x, y], i) =>
      `<path d="M ${x} ${y} q -5 -2 -7 -5 q 4 -1 7 1 q -1 -4 1 -6 q 2 3 1 6 q 3 -2 7 -1 q -2 3 -7 5 Z" fill="${i % 2 ? '#D93A2B' : '#E8502F'}"/>`).join('')],

  ['phlox', 'Vlambloem', 'Phlox paniculata', 'flower', 'Polemoniaceae', () =>
    rosette('lance', { count: 5, spread: 52, scale: 0.9, colors: ['#3D6B44', LEAF_MID] }) +
    [36, 50, 64].map((x, i) => stem(x, 84, x, 40 - i * 2, 1.1)).join('') +
    umbel(36, 40, '#C9599E', { r: 7, n: 9, dotR: 2.4, dome: 3 }) +
    umbel(50, 34, '#E070AE', { r: 8, n: 11, dotR: 2.6, dome: 3.5 }) +
    umbel(64, 42, '#B84E8E', { r: 7, n: 9, dotR: 2.3, dome: 3 })],

  ['thalictrum', 'Ruit', 'Thalictrum delavayi', 'flower', 'Ranunculaceae', () =>
    rosette('palmate', { count: 4, spread: 46, scale: 0.62, colors: ['#4C7A50', '#63915A'] }) +
    haze(50, 84, 30, '#B49BD0')],

  ['salvia_nemorosa', 'Bossalie', 'Salvia nemorosa', 'flower', 'Lamiaceae', () =>
    rosette('lance', { count: 5, spread: 56, scale: 0.8, colors: ['#4A6E4A', '#5C8256'] }) +
    spike(34, 78, 40, '#5A4A9E') + spike(50, 80, 28, '#6B57B5') + spike(66, 78, 42, '#4E3F8C')],

  ['verbena_bonariensis', 'IJzerhard', 'Verbena bonariensis', 'flower', 'Verbenaceae', () =>
    leaf('lance', { rot: -44, scale: 0.55, fill: '#4E7A4E' }) + leaf('lance', { rot: 38, scale: 0.55, fill: '#5C8A4E' }) +
    // Tall bare stems topped by flat violet heads — the plant's whole signature.
    [[28, 40], [40, 26], [52, 16], [64, 28], [74, 42]].map(([x, y]) =>
      stem(50, 88, x, y + 4, 1) + umbel(x, y, '#7B5FBF', { r: 6, n: 9, dotR: 2.2, dome: 2 })).join('')],

  ['pennisetum', 'Lampenpoetsersgras', 'Pennisetum alopecuroides', 'grass', 'Poaceae', () =>
    [-34, -17, 0, 17, 34].map((r, i) => leaf('sword', { rot: r, scale: 0.72 + (i % 2) * 0.08, fill: i % 2 ? '#7A9A5E' : '#638751', vein: false })).join('') +
    bottlebrush(36, 66, 30, '#C9A87C', -7) + bottlebrush(50, 68, 20, '#DDC79A', 1) + bottlebrush(64, 66, 32, '#BE9E74', 8)],

  ['sedum_spectabile', 'Hemelsleutel', 'Hylotelephium spectabile', 'succulent', 'Crassulaceae', () =>
    rosette('succulent', { count: 7, spread: 72, scale: 1.15, colors: ['#7FA07A', '#93B187'] }) +
    [[34, 44], [50, 36], [66, 46]].map(([x, y]) =>
      stem(x, 74, x, y + 4, 1.2) + umbel(x, y, '#D08AA0', { r: 8, n: 12, dotR: 2.1, dome: 2 })).join('')],

  ['nepeta', 'Kattenkruid', 'Nepeta × faassenii', 'herb', 'Lamiaceae', () =>
    rosette('lance', { count: 7, spread: 76, scale: 0.78, colors: ['#8A9E82', '#9CAE92'] }) +
    [30, 42, 54, 66].map((x, i) => spike(x, 74, 42 + (i % 2) * 6, '#9A93D6', { width: 3, steps: 6, dotR: 1.7 })).join('')],

  ['kniphofia', 'Vuurpijl', 'Kniphofia uvaria', 'flower', 'Asphodelaceae', () =>
    [-34, -18, 0, 16, 32].map((r, i) => leaf('sword', { rot: r, scale: 0.82 + (i % 2) * 0.08, fill: i % 2 ? '#5C8A4E' : '#47764A', vein: false })).join('') +
    torch(38, 78, 40, '#E8672B', '#E8B23A') + torch(52, 80, 26, '#E04A22', '#F0C24E') + torch(66, 78, 44, '#E8672B', '#E8B23A')],

  ['stipa_tenuissima', 'Vedergras', 'Nassella tenuissima', 'grass', 'Poaceae', () =>
    hairTuft(50, 88, '#C7B98A', { n: 17, h: 50, spread: 28 }) +
    hairTuft(50, 88, '#A8A06C', { n: 9, h: 42, spread: 20 })],

  // ── Differentiating the four shared icons ─────────────────────────────
  ['ladyfern', 'Wijfjesvaren', 'Athyrium filix-femina', 'fern', 'Athyriaceae', () =>
    [-42, -22, 0, 22, 42].map((r, i) => frond(50, 88, r, 44 + (i === 2 ? 12 : i % 2 ? 4 : 0), i % 2 ? '#5C8A4E' : '#47764A', true)).join('')],

  ['rose_climbing', 'Klimroos', 'Rosa (klimvariëteit)', 'flower', 'Rosaceae', () => {
    // A trellis reads as "climbing" far better than the shrub silhouette does.
    const trellis = [26, 50, 74].map((x) => `<path d="M ${x} 92 L ${x} 20" stroke="#C2A98A" stroke-width="1.4" opacity="0.75"/>`).join('') +
      [34, 56, 78].map((y) => `<path d="M 22 ${y} L 78 ${y}" stroke="#C2A98A" stroke-width="1.4" opacity="0.75"/>`).join('')
    const cane = `<path d="M 40 92 Q 30 66 46 50 Q 62 34 52 18" stroke="${STEM}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
    const leaves = [[36, 74, -30], [42, 58, 30], [50, 42, -25], [56, 28, 28]]
      .map(([x, y, r]) => leaf('lobed', { x, y, rot: r, scale: 0.34, fill: '#3F6E45' })).join('')
    const flowers = [[30, 62], [58, 46], [46, 26], [68, 70]]
      .map(([x, y], i) => bloom(x, y, { r: i === 2 ? 7 : 6, petals: 6, petal: i % 2 ? '#E2879F' : '#D96C88', centre: '#E8C860', centreR: 1.8 })).join('')
    return trellis + cane + leaves + flowers
  }],

  ['rudbeckia', 'Zonnehoed (vaste)', 'Rudbeckia fulgida', 'flower', 'Asteraceae', () =>
    rosette('lance', { count: 5, spread: 58, scale: 0.78, colors: ['#3F6E45', LEAF_MID] }) +
    [[34, 42], [52, 30], [68, 46]].map(([x, y], i) =>
      stem(x, 84, x, y + 5, 1.2) +
      bloom(x, y, { r: i === 1 ? 9 : 7.5, petals: 12, petal: '#E8B02A', centre: '#3A2A20', centreR: i === 1 ? 3 : 2.5 })).join('')],

  ['hydrangea_climbing', 'Klimhortensia', 'Hydrangea anomala subsp. petiolaris', 'climber', 'Hydrangeaceae', () => {
    const wall = `<path d="M 16 92 L 16 14" stroke="#C2A98A" stroke-width="1.6" opacity="0.6"/>`
    const stems = [[16, 84, 44, 60], [16, 62, 52, 40], [16, 40, 46, 22]]
      .map(([x1, y1, x2, y2]) => `<path d="M ${x1} ${y1} Q ${(x1 + x2) / 2} ${y1 - 4} ${x2} ${y2}" stroke="${STEM}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`).join('')
    const leaves = [[30, 74, -50], [38, 52, -30], [30, 34, -60], [50, 66, 20]]
      .map(([x, y, r]) => leaf('heart', { x, y, rot: r, scale: 0.5, fill: '#3A6B42' })).join('')
    // Lacecap: a ring of flat white florets round a fine fertile centre.
    const lacecap = [[52, 56], [58, 34], [44, 20]].map(([x, y]) =>
      umbel(x, y, '#F2EFE2', { r: 8, n: 8, dotR: 2.4 }) + umbel(x, y, '#D8D8C0', { r: 3.4, n: 6, dotR: 1.2 })).join('')
    return wall + stems + leaves + lacecap
  }],
]

// ── Emit ─────────────────────────────────────────────────────────────────

function svg(dutch, latin, body) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" role="img" aria-label="${esc(dutch)}"><title>${esc(dutch)} — ${esc(latin)}</title>
  ${ground()}
  ${body}
</svg>
`
}

const manifestPath = join(ICONS_DIR, 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const plants = manifest.plants ?? manifest

for (const [id, dutch, latin, cat, family, draw] of RECIPES) {
  writeFileSync(join(ICONS_DIR, `${id}.svg`), svg(dutch, latin, draw()))
  const entry = { id, name: dutch, sci: latin, cat, form: 'bare', family, file: `${id}.svg` }
  const existing = plants.find((p) => p.id === id)
  if (existing) Object.assign(existing, entry)
  else plants.push(entry)
}

manifest.count = plants.length
manifest.iconCount = plants.length
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`wrote ${RECIPES.length} icons; manifest now has ${plants.length} entries`)
