/**
 * Adapters that turn the anonymized public-garden payload (#804) into the
 * shapes the existing read-only map renderer (MapView) expects. Pure and
 * unit-testable; no React.
 */
import type {
  CanvasData,
  MapDetail,
  MapPlant,
  PublicGardenDetail,
  PublicGardenPlant,
} from '../types'
import { deriveGardenBounds, deriveViewBoxString } from '../utils/gardenFromCanvas'

/** Garden id used for the read-only detail render — the public payload carries
 * no owner-facing map id (and none is needed: nothing here can be edited). */
const PUBLIC_MAP_ID = -1

/**
 * Build a MapDetail-shaped object from the public payload.
 * bearing is unknown publicly (exact orientation is arguably location data), so
 * we render with 0 — fine for a read-only layout, sun overlays aren't used.
 */
export function publicGardenToMapDetail(garden: PublicGardenDetail): MapDetail {
  return {
    id: PUBLIC_MAP_ID,
    name: garden.name,
    slug: garden.slug,
    svg_file: '',
    viewbox: garden.viewbox,
    scale_info: null,
    sort_order: 0,
    canvas_data: garden.canvas_data,
    thumbnail_file: garden.thumbnail_file,
    map_type: 'outdoor',
    lat: garden.approx_lat,
    lon: garden.approx_lon,
    bearing: 0,
  }
}

/**
 * Map a public plant to the MapPlant shape the renderer needs. Care/status
 * fields are unknown publicly (deliberately stripped) so they get neutral
 * defaults — the read-only view never shows warnings or care badges.
 *
 * `name` carries the scientific (latin) name when the owner's species is
 * known — the atlas shows scientific names on the map (issue #804 scope 3).
 */
export function publicPlantToMapPlant(plant: PublicGardenPlant): MapPlant {
  return {
    id: plant.id,
    name: plant.latin_name ?? plant.name,
    species: plant.latin_name,
    species_common_name_nl: null,
    species_common_name_en: null,
    map_x: plant.map_x,
    map_y: plant.map_y,
    photo_path: plant.photo_path,
    container_id: null,
    ground_zone_id: null,
    display_radius_cm: plant.display_radius_cm,
    care_status: 'good',
    temp_status: 'comfortable',
    most_urgent: null,
    sun_requirement: null,
    measured_sun_hours: null,
    plant_type: plant.plant_type,
    icon_key: plant.icon_key,
    species_id: null,
    phenology: null,
    is_locked: false,
    quantity: 1,
    top_alert: null,
    alerts: [],
    // Care warnings are never shown on the read-only atlas render
    // (showWarnings={false}), so neutral empty values are correct.
    top_warning: null,
    warnings: [],
  }
}

/**
 * Tight viewBox framing the garden's zones (same derivation the real map page
 * uses via useSunVisualization). Falls back to the full canvas.
 */
export function publicGardenViewBox(garden: PublicGardenDetail): string {
  try {
    const canvas = garden.canvas_data ? (JSON.parse(garden.canvas_data) as CanvasData) : null
    if (!canvas) return garden.viewbox
    return deriveViewBoxString(canvas.zones, canvas.canvas_w, canvas.canvas_h)
  } catch {
    return garden.viewbox
  }
}

/** Bounding box of the garden's zones, for the map's pan/zoom base. */
export function publicGardenBounds(garden: PublicGardenDetail) {
  try {
    const canvas = garden.canvas_data ? (JSON.parse(garden.canvas_data) as CanvasData) : null
    if (!canvas) return null
    return deriveGardenBounds(canvas.zones)
  } catch {
    return null
  }
}
