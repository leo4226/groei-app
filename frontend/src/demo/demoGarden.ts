import type { CanvasData, MapDetail, MapObject, MapPlant } from '../types'

// Static snapshot powering the public demo garden (/demo) and the landing-page
// sun-heatmap video. A fictional Amsterdam city garden — generic coordinates,
// deliberately NOT a real user's garden or address. All sun/shadow/heatmap
// rendering runs client-side off this data; the page needs no backend.

const DEMO_CANVAS: CanvasData = {
  scale_px_per_m: 46,
  canvas_w: 500,
  canvas_h: 640,
  mapType: 'outdoor',
  // Zones tile EXACTLY (no overlaps): visible seams and paint-order artifacts
  // come from overlapping rects, so every edge below is flush with its
  // neighbours. Garden surface: x 60..405, y 40..546.
  zones: [
    // Boundary fences (cast shadows; excluded from the sun perimeter).
    // fence-n runs between the two side fences; fence-e is the brick wall.
    { id: 'fence-n', type: 'fence', shape: 'rect', x: 60, y: 30, width: 345, height: 10, label: 'Schutting', fenceMaterial: 'wood', fenceHeightM: 1.8 },
    { id: 'fence-w', type: 'fence', shape: 'rect', x: 50, y: 30, width: 10, height: 516, label: 'Schutting', fenceMaterial: 'wood', fenceHeightM: 1.8 },
    { id: 'fence-e', type: 'fence', shape: 'rect', x: 405, y: 30, width: 10, height: 516, label: 'Muur', fenceMaterial: 'brick', fenceHeightM: 2.0 },
    // Shed in the back corner (flush with border-back to its right). Kept
    // narrow enough that the achterborder rows hold >75% of a full heatmap
    // row — trimRaggedEdges drops sparser rows as ragged edges.
    { id: 'shed', type: 'structure', shape: 'rect', x: 60, y: 40, width: 75, height: 70, label: 'Schuur', structureHeightM: 2.4 },
    // Planting borders
    { id: 'border-back', type: 'soil', shape: 'rect', x: 135, y: 40, width: 270, height: 70, label: 'Achterborder' },
    { id: 'border-w', type: 'soil', shape: 'rect', x: 60, y: 110, width: 45, height: 316, label: 'Schaduwborder' },
    { id: 'border-e', type: 'soil', shape: 'rect', x: 360, y: 110, width: 45, height: 316, label: 'Zonborder' },
    // Lawn with the pond fully inside it
    { id: 'lawn', type: 'lawn', shape: 'rect', x: 105, y: 110, width: 255, height: 316, label: 'Gazon' },
    { id: 'pond', type: 'water', shape: 'rect', x: 275, y: 135, width: 70, height: 55, label: 'Vijver' },
    // Vegetable raised bed on the lawn
    { id: 'moestuin', type: 'raised_bed', shape: 'rect', x: 260, y: 350, width: 95, height: 70, label: 'Moestuin', raisedBedHeightM: 0.4 },
    // Terrace by the house
    { id: 'terras', type: 'deck', shape: 'rect', x: 60, y: 426, width: 345, height: 120, label: 'Terras' },
  ],
  // Explicit sun perimeter: an L-shape that excludes the shed, outset 2px past
  // the surface zones so heatmap edge cells (whose four corners must all fall
  // inside the polygon) reach the walls exactly instead of dropping the
  // outermost row. Without this the auto convex-hull cuts a diagonal across
  // the shed, painting a heatmap staircase over its roof.
  gardenPerimeter: [
    [133, 38], [407, 38], [407, 548], [58, 548], [58, 108], [133, 108],
  ],
  shadowCasters: [
    { id: 'house', label: 'Huis', type: 'rect', x: 40, y: 556, width: 440, height: 84, heightCm: 900 },
    { id: 'neighbour-tree', label: 'Boom van de buren', type: 'circle', cx: 455, cy: 180, radius: 45, heightCm: 750 },
  ],
}

export const DEMO_MAP: MapDetail = {
  id: -1,
  name: 'Voorbeeldtuin',
  slug: 'demo',
  svg_file: '',
  viewbox: '0 0 500 640',
  scale_info: null,
  sort_order: 0,
  canvas_data: JSON.stringify(DEMO_CANVAS),
  thumbnail_file: null,
  map_type: 'outdoor',
  // Central Amsterdam — generic city coordinates, not a real user location.
  lat: 52.37,
  lon: 4.89,
  bearing: 15,
}

let nextId = -100

function demoPlant(
  name: string,
  icon: string,
  x: number,
  y: number,
  opts: { r?: number; qty?: number; species?: string; sun?: string; zone?: string } = {},
): MapPlant {
  return {
    id: nextId--,
    name,
    species: opts.species ?? null,
    species_common_name_nl: name,
    species_common_name_en: null,
    map_x: x,
    map_y: y,
    photo_path: null,
    container_id: null,
    ground_zone_id: opts.zone ?? null,
    display_radius_cm: opts.r ?? 30,
    care_status: 'good',
    temp_status: 'comfortable',
    most_urgent: null,
    sun_requirement: opts.sun ?? null,
    measured_sun_hours: null,
    plant_type: null,
    icon_key: icon,
    species_id: null,
    phenology: null,
    is_locked: true,
    quantity: opts.qty ?? 1,
    top_alert: null,
    alerts: [],
    top_warning: null,
    warnings: [],
  }
}

export const DEMO_PLANTS: MapPlant[] = [
  // Achterborder (zon)
  demoPlant('Vlinderstruik', 'buddleja', 200, 75, { r: 60, species: 'Buddleja davidii', sun: 'full_sun', zone: 'border-back' }),
  demoPlant('Vlier', 'elder', 330, 70, { r: 55, species: 'Sambucus nigra', zone: 'border-back' }),
  demoPlant('Stokroos', 'stokroos', 385, 80, { r: 35, qty: 3, species: 'Alcea rosea', sun: 'full_sun', zone: 'border-back' }),
  demoPlant('Zonnehoed', 'zonnehoed', 250, 95, { r: 45, qty: 5, species: 'Echinacea purpurea', sun: 'full_sun', zone: 'border-back' }),
  demoPlant('Klaproos', 'poppy_bare', 165, 100, { r: 40, qty: 8, species: 'Papaver rhoeas', zone: 'border-back' }),
  demoPlant('Dahlia', 'dahlia_bare', 215, 100, { r: 40, qty: 3, zone: 'border-back' }),
  // Schaduwborder (west)
  demoPlant('Hortensia', 'hydrangea_bare', 82, 150, { r: 55, species: 'Hydrangea macrophylla', sun: 'partial_shade', zone: 'border-w' }),
  demoPlant('Hosta', 'hosta', 82, 220, { r: 45, qty: 3, sun: 'shade', zone: 'border-w' }),
  demoPlant('Mannetjesvaren', 'malefern', 82, 280, { r: 45, qty: 2, species: 'Dryopteris filix-mas', sun: 'shade', zone: 'border-w' }),
  demoPlant('Vingerhoedskruid', 'foxglove_bare', 82, 340, { r: 40, qty: 4, species: 'Digitalis purpurea', sun: 'partial_shade', zone: 'border-w' }),
  demoPlant('Vergeet-mij-nietje', 'forgetmenot_bare', 82, 396, { r: 32, qty: 6, species: 'Myosotis sylvatica', zone: 'border-w' }),
  // Zonborder (oost)
  demoPlant('Lavendel', 'lavender_bare', 382, 140, { r: 42, qty: 4, species: 'Lavandula angustifolia', sun: 'full_sun', zone: 'border-e' }),
  demoPlant('Wilde bloemen', 'wildebloemen', 382, 210, { r: 55, zone: 'border-e' }),
  demoPlant('Korenbloem', 'cornflower_bare', 382, 270, { r: 35, qty: 10, species: 'Centaurea cyanus', zone: 'border-e' }),
  demoPlant('Teunisbloem', 'oenothera', 382, 320, { r: 35, qty: 3, species: 'Oenothera biennis', zone: 'border-e' }),
  demoPlant('Pioenroos', 'peony_bare', 382, 378, { r: 40, zone: 'border-e' }),
  demoPlant('Heide', 'heather_bare', 382, 412, { r: 32, qty: 3, zone: 'border-e' }),
  // Gazon
  demoPlant('Appelboom', 'apple_bare', 180, 250, { r: 80, species: 'Malus domestica' }),
  demoPlant('Krokus', 'crocus_bare', 230, 180, { r: 26, qty: 15 }),
  demoPlant('Prachtriet', 'silvergrass_bare', 330, 300, { r: 45, species: 'Miscanthus sinensis' }),
  // Moestuin
  demoPlant('Sla', 'lettuce_bare', 285, 370, { r: 22, qty: 6, zone: 'moestuin' }),
  demoPlant('Tomaat', 'tomato_bare', 330, 370, { r: 26, qty: 4, zone: 'moestuin' }),
  demoPlant('Courgette', 'zucchini_bare', 305, 400, { r: 30, qty: 2, zone: 'moestuin' }),
  // Terras
  demoPlant('Blauwe regen', 'wisteria', 200, 540, { r: 45, species: 'Wisteria sinensis' }),
]

function demoPot(name: string, x: number, y: number, diameter: number, plant: MapPlant): MapObject {
  return {
    id: nextId--,
    name,
    object_type: 'pot',
    shape: 'circle',
    diameter_cm: diameter,
    width_cm: null,
    depth_cm: null,
    material: 'terracotta',
    color: '#c26d4f',
    map_id: DEMO_MAP.id,
    map_x: x,
    map_y: y,
    rotation: 0,
    notes: null,
    is_active: true,
    created_at: null,
    updated_at: null,
    contained_plants: [plant],
    category: 'container',
    label: null,
    preset: null,
  }
}

export const DEMO_OBJECTS: MapObject[] = [
  demoPot('Pot rozemarijn', 120, 480, 40, demoPlant('Rozemarijn', 'rosemary', 120, 480, { r: 18 })),
  demoPot('Pot geranium', 350, 470, 35, demoPlant('Geranium', 'geranium', 350, 470, { r: 16 })),
]

// Static biodiversity snapshot shown on the demo page. Numbers are indicative
// for this plant list; the real card computes them live per garden.
export const DEMO_BIODIVERSITY = {
  score: 74,
  speciesCount: 26,
  nativeCount: 9,
  drachtplantCount: 13,
  beeSpecies: 31,
  // Per-month count of flowering pollinator plants (Jan..Dec) — the bloeiboog.
  bloomMonths: [0, 1, 3, 5, 7, 9, 11, 10, 8, 5, 1, 0],
}

// What the plant helper would recommend for this garden (static snapshot of
// the real "Verbeter je tuin" suggestions): fills the Dec–Jan bloeiboog gap
// and adds late/early forage for wild bees. Shown on the landing page next to
// the biodiversity preview.
export interface DemoSuggestion {
  icon: string
  name_nl: string
  name_en: string
  badge: 'native' | 'streek'
  reason_nl: string
  reason_en: string
}

export const DEMO_SUGGESTIONS: DemoSuggestion[] = [
  {
    icon: 'snowdrop_bare',
    name_nl: 'Sneeuwklokje',
    name_en: 'Snowdrop',
    badge: 'native',
    reason_nl: 'Bloeit in januari–februari en vult zo het wintergat in je bloeiboog.',
    reason_en: 'Flowers in January–February, filling the winter gap in your bloom arc.',
  },
  {
    icon: 'ivy_bare',
    name_nl: 'Klimop',
    name_en: 'Ivy',
    badge: 'native',
    reason_nl: 'Late bloei tot in november — de laatste nectar van het jaar voor bijen.',
    reason_en: 'Blooms into November — the last nectar of the year for bees.',
  },
  {
    icon: 'thyme_bare',
    name_nl: 'Wilde tijm',
    name_en: 'Wild thyme',
    badge: 'streek',
    reason_nl: 'Streekeigen drachtplant die het goed doet in jouw zonnige border.',
    reason_en: 'A regional forage plant that thrives in your sunny border.',
  },
]
