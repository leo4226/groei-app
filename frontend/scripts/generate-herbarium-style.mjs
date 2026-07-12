// Regenerates public/map-styles/herbarium.json from OpenFreeMap's Positron
// style: every color literal is remapped to the Floreren herbarium palette
// (see src/index.css tokens) and the grey shaded-relief raster is dropped.
//
//   node scripts/generate-herbarium-style.mjs
//
// Rerun when OpenFreeMap updates Positron; unmapped colors are reported so
// the palette below can be extended deliberately rather than silently.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_STYLE = 'https://tiles.openfreemap.org/styles/positron'

// Positron grey → Floreren herbarium. Keys must match the source literally.
const PALETTE = {
  // grounds
  'rgb(242,243,240)': '#F1EBDB',        // background + piers → paper land
  'rgb(230, 233, 229)': '#DCE5C8',      // parks → soft floreren green
  'rgb(220,224,220)': '#D3DEC0',        // woodland
  'rgb(194, 200, 202)': '#CBD5CE',      // water → muted sage
  'rgb(234, 234, 230)': '#EAE2CE',      // residential landuse
  'hsl(0,0%,98%)': '#F7F3E7',           // ice / glacier
  // structures
  'rgb(234, 234, 229)': '#E3D9C2',      // buildings
  'rgb(219, 219, 218)': '#D6CBAF',      // building outlines
  // roads & rail
  'rgb(213, 213, 213)': '#D9CFB8',      // casings → --color-border
  'rgb(234, 234, 234)': '#EFE8D5',      // tunnel inner
  'rgb(234,234,234)': '#EFE8D5',        // paths
  'hsl(0,0%,88%)': '#DFD6BF',           // minor roads, taxiways
  'hsla(0,0%,85%,0.53)': 'rgba(217,207,184,0.55)', // motorway subtle
  'hsla(0,0%,85%,0.69)': 'rgba(217,207,184,0.7)',  // major subtle
  '#dddddd': '#D3C9B0',                 // railway
  '#fafafa': '#F5F0E3',                 // railway dash
  'hsl(195,17%,78%)': '#C7CFC5',        // waterways
  '#fff': '#FBF7EE',                    // road inner + label halos → paper
  '#ffffff': '#FBF7EE',
  'rgba(255, 255, 255, 1)': '#FBF7EE',  // aeroways
  'rgba(255,255,255,0.7)': 'rgba(251,247,238,0.75)', // water label halo
  '#f8f4f0': '#F5F0E3',                 // path-name halo
  // text
  '#000': '#1F2A1E',                    // city/country labels → ink
  '#333': '#4A5A44',                    // state/other labels → ink soft
  '#666': '#8A9482',                    // road names, airports → muted
  'hsl(0,0%,66%)': '#8A9482',           // waterway labels
  'hsl(30,0%,62%)': '#8A9482',          // path names
  '#495e91': '#6E7E8C',                 // water body labels → muted slate
  'hsl(0,0%,70%)': '#B4A98F',           // admin boundaries
}

const res = await fetch(SOURCE_STYLE)
if (!res.ok) throw new Error(`Failed to fetch ${SOURCE_STYLE}: ${res.status}`)
const style = await res.json()

const unmapped = new Set()
function remap(node) {
  if (typeof node === 'string') {
    if (/^(#|rgb|hsl)/.test(node)) {
      if (PALETTE[node]) return PALETTE[node]
      unmapped.add(node)
    }
    return node
  }
  if (Array.isArray(node)) return node.map(remap)
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, remap(v)]))
  }
  return node
}

// Drop the Natural Earth shaded-relief raster — grey hillshade fights the paper look.
const rasterSources = Object.entries(style.sources)
  .filter(([, s]) => s.type === 'raster')
  .map(([name]) => name)
for (const name of rasterSources) delete style.sources[name]
style.layers = style.layers.filter(l => !rasterSources.includes(l.source))

style.layers = style.layers.map(remap)
style.name = 'Floreren Herbarium'
style.metadata = {
  ...(style.metadata ?? {}),
  'floreren:generated-from': SOURCE_STYLE,
  'floreren:generator': 'scripts/generate-herbarium-style.mjs',
}

if (unmapped.size) {
  console.warn('Unmapped colors (kept as-is):', [...unmapped].join(', '))
}

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'map-styles', 'herbarium.json')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(style))
console.log(`Wrote ${out} (${style.layers.length} layers)`)
