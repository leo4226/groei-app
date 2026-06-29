import { useState, useCallback, useEffect } from 'react'
import type { MapDetail, MapPlant, MapObject, GroundZone, SecondaryMarker } from '../types'
import { maps, groundZones as groundZonesApi, plants as plantsApi, objects as objectsApi } from '../api/client'

export interface RestoreInfo {
  label: string
  canUndo: boolean
  restore: () => Promise<void>
}

export interface UseMapDataReturn {
  map: MapDetail | null
  plants: MapPlant[]
  objects: MapObject[]
  secondaryMarkers: SecondaryMarker[]
  groundZones: GroundZone[]
  loading: boolean
  refresh: () => Promise<void>
  /** Patch a single plant in place (top-level or inside a container) without a full reload. */
  patchPlant: (plantId: number, patch: Partial<MapPlant>) => void
  remove: (type: 'plant' | 'object', id: number) => Promise<RestoreInfo | null>
  duplicate: (plantId: number) => Promise<void>
}

export function useMapData(slug: string): UseMapDataReturn {
  const [map, setMap] = useState<MapDetail | null>(null)
  const [plants, setPlants] = useState<MapPlant[]>([])
  const [objects, setObjects] = useState<MapObject[]>([])
  const [secondaryMarkers, setSecondaryMarkers] = useState<SecondaryMarker[]>([])
  const [groundZones, setGroundZones] = useState<GroundZone[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [mapDetail, items, zones] = await Promise.all([
        maps.detail(slug),
        maps.items(slug),
        groundZonesApi.list(slug),
      ])
      setMap(mapDetail)
      setPlants(items.plants)
      setObjects(items.objects)
      setSecondaryMarkers(items.secondary_markers ?? [])
      setGroundZones(zones)
    } catch (err) {
      console.error('Failed to load map data:', err)
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    refresh()
  }, [refresh])

  const patchPlant = useCallback((plantId: number, patch: Partial<MapPlant>) => {
    setPlants((prev) => prev.map((p) => (p.id === plantId ? { ...p, ...patch } : p)))
    // The plant may live inside a container (object.contained_plants).
    setObjects((prev) =>
      prev.map((o) =>
        o.contained_plants.some((cp) => cp.id === plantId)
          ? { ...o, contained_plants: o.contained_plants.map((cp) => (cp.id === plantId ? { ...cp, ...patch } : cp)) }
          : o,
      ),
    )
  }, [])

  const remove = useCallback(
    async (type: 'plant' | 'object', id: number): Promise<RestoreInfo | null> => {
      try {
        if (type === 'plant') {
          const item = plants.find((p) => p.id === id)
          if (!item) return null

          await plantsApi.archive(id)
          await refresh()

          return {
            label: item.name,
            canUndo: true,
            restore: async () => {
              await plantsApi.restore(id)
              await refresh()
            },
          }
        } else {
          const item = objects.find((o) => o.id === id)
          if (!item) return null

          if (item.contained_plants.length > 0) {
            const confirmed = window.confirm(
              `"${item.name}" bevat ${item.contained_plants.length} plant(en). Wil je dit object toch verwijderen?`
            )
            if (!confirmed) return null
          }

          await objectsApi.archive(id)
          await refresh()

          return {
            label: item.name,
            canUndo: item.contained_plants.length === 0,
            restore: async () => {
              await objectsApi.restore(id)
              await refresh()
            },
          }
        }
      } catch (err) {
        console.error('Failed to remove item:', err)
        return null
      }
    },
    [plants, objects, refresh]
  )

  const duplicate = useCallback(
    async (plantId: number): Promise<void> => {
      try {
        const newPlant = await plantsApi.duplicate(plantId)

        if (map) {
          const [, , vw, vh] = map.viewbox.split(' ').map(Number)
          await plantsApi.setPosition(newPlant.id, {
            map_id: map.id,
            map_x: vw / 2,
            map_y: vh / 2,
            ground_zone_id: null,
          })
        }

        await refresh()
      } catch (err) {
        console.error('Failed to duplicate plant:', err)
      }
    },
    [map, refresh]
  )

  return {
    map,
    plants,
    objects,
    secondaryMarkers,
    groundZones,
    loading,
    refresh,
    patchPlant,
    remove,
    duplicate,
  }
}
