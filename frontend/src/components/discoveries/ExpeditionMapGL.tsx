import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { GeoEntry } from '../../utils/expeditionGeo'
import ExpeditionMap from './ExpeditionMap'
import Glyph from '../ui/Glyph'

interface Props {
  /** Entries with coordinates, chronological (index ascending). */
  entries: GeoEntry[]
  /** Called with the clicked entry id. */
  onSelect?: (ids: number[]) => void
  /** Compass letters for the SVG fallback map. */
  compass?: [string, string, string, string]
}

const STYLE_URL = '/map-styles/herbarium.json'
const TERRA = '#B2664A'
const PRIMARY = '#2F5D3A'
const PAPER = '#FFFEF9'

function toGeoJSON(entries: GeoEntry[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: entries.map(e => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
      properties: { id: e.id, nr: e.index },
    })),
  }
}

function boundsOf(entries: GeoEntry[]): maplibregl.LngLatBounds {
  const b = new maplibregl.LngLatBounds()
  for (const e of entries) b.extend([e.lon, e.lat])
  return b
}

/**
 * Street-level expedition map: MapLibre GL over OpenFreeMap vector tiles with
 * the custom herbarium style. Pins and clusters are GeoJSON layers on top.
 * Falls back to the bundled-coastline SVG map when WebGL or the style/tiles
 * are unavailable (e.g. offline PWA).
 */
export default function ExpeditionMapGL({ entries, onSelect, compass }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const entriesRef = useRef(entries)
  const onSelectRef = useRef(onSelect)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  entriesRef.current = entries
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!containerRef.current || failed) return

    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE_URL,
        bounds: boundsOf(entriesRef.current),
        fitBoundsOptions: { padding: 60, maxZoom: 13 },
        attributionControl: { compact: true },
        // Two-finger pan on touch / ctrl+scroll on desktop, so the journal
        // page keeps scrolling normally over the map.
        cooperativeGestures: true,
      })
    } catch {
      // WebGL unavailable — fall back to the SVG map
      setFailed(true)
      return
    }
    mapRef.current = map

    // If the style never loads (offline, tile host down), fall back.
    const failTimer = window.setTimeout(() => {
      if (!map.isStyleLoaded()) setFailed(true)
    }, 12000)

    map.on('load', () => {
      window.clearTimeout(failTimer)
      setReady(true)

      map.addSource('finds', {
        type: 'geojson',
        data: toGeoJSON(entriesRef.current),
        cluster: true,
        clusterMaxZoom: 15,
        clusterRadius: 44,
      })

      map.addLayer({
        id: 'clusters', type: 'circle', source: 'finds',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': PRIMARY,
          'circle-radius': ['step', ['get', 'point_count'], 13, 10, 17],
          'circle-stroke-width': 2, 'circle-stroke-color': PAPER,
        },
      })
      map.addLayer({
        id: 'cluster-count', type: 'symbol', source: 'finds',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Noto Sans Bold'], 'text-size': 11,
        },
        paint: { 'text-color': '#ffffff' },
      })
      map.addLayer({
        id: 'pin', type: 'circle', source: 'finds',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': TERRA, 'circle-radius': 9,
          'circle-stroke-width': 2, 'circle-stroke-color': PAPER,
        },
      })
      map.addLayer({
        id: 'pin-nr', type: 'symbol', source: 'finds',
        filter: ['!', ['has', 'point_count']],
        layout: { 'text-field': ['to-string', ['get', 'nr']], 'text-font': ['Noto Sans Bold'], 'text-size': 9 },
        paint: { 'text-color': '#ffffff' },
      })

      map.on('click', 'clusters', async (e) => {
        const feature = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0]
        if (!feature) return
        const source = map.getSource('finds') as maplibregl.GeoJSONSource
        const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id as number)
        map.easeTo({ center: (feature.geometry as Point).coordinates as [number, number], zoom: zoom + 0.5 })
      })
      map.on('click', 'pin', (e) => {
        const feature = e.features?.[0]
        if (feature) onSelectRef.current?.([feature.properties.id as number])
      })
      for (const layer of ['clusters', 'pin']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
      }
    })

    return () => {
      window.clearTimeout(failTimer)
      mapRef.current = null
      map.remove()
    }
  }, [failed])

  // Keep sources + framing in sync when entries change
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const finds = map.getSource('finds') as maplibregl.GeoJSONSource | undefined
    finds?.setData(toGeoJSON(entries))
  }, [entries, ready])

  if (failed || entries.length === 0) {
    return <ExpeditionMap entries={entries} onSelect={onSelect} compass={compass} />
  }

  const zoomBtn = 'flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border bg-paper/90 text-text-soft shadow-sm transition-colors hover:border-primary hover:text-primary'

  return (
    <div className="relative">
      <div ref={containerRef} className="h-[300px] w-full sm:h-[430px]" />
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button type="button" aria-label="Zoom in" className={zoomBtn}
                onClick={() => mapRef.current?.zoomIn()}>
          <span className="text-base leading-none">+</span>
        </button>
        <button type="button" aria-label="Zoom out" className={zoomBtn}
                onClick={() => mapRef.current?.zoomOut()}>
          <span className="text-base leading-none">−</span>
        </button>
        <button type="button" aria-label="Reset" className={zoomBtn}
                onClick={() => mapRef.current?.fitBounds(boundsOf(entriesRef.current), { padding: 60, maxZoom: 13 })}>
          <Glyph name="refresh" size={13} />
        </button>
      </div>
    </div>
  )
}
