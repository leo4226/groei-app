import type { MapPlant, MapObject } from '../../types'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import { getCareDisplay } from '../../utils/careDisplay'
import { computeSuitability } from '../../utils/suitability'

interface Props {
  plants: MapPlant[]
  objects: MapObject[]
  onPlantTap: (plant: MapPlant) => void
  heatmapCells?: HeatmapCell[]
}


export default function MapLegend({ plants, objects, onPlantTap, heatmapCells }: Props) {
  const containedPlants = objects.flatMap((obj) =>
    obj.contained_plants.map((p) => ({ ...p, containerName: obj.name, _containerX: obj.map_x, _containerY: obj.map_y }))
  )

  const allPlants = [...plants, ...containedPlants].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  )

  if (allPlants.length === 0) return null

  const currentMonth = new Date().getMonth() + 1

  function getSuitabilityLabel(plant: MapPlant & { _containerX?: number | null; _containerY?: number | null }): string {
    if (plant.phenology && heatmapCells) {
      const px = plant._containerX ?? plant.map_x
      const py = plant._containerY ?? plant.map_y
      const cell = heatmapCells.find(c => px >= c.x && px < c.x + c.w && py >= c.y && py < c.y + c.h)
      const sunHours = cell?.sunHours ?? 0
      const s = computeSuitability(plant.phenology, sunHours, currentMonth)
      return s.badgeLabel
    }
    return getCareDisplay(plant).label
  }

  return (
    <div className="bg-surface/95 backdrop-blur-sm rounded-xl border border-border shadow-sm p-3 min-w-[140px]">
      <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Plants</h3>
      <ul className="space-y-1.5">
        {allPlants.map((plant) => {
          const color = getCareDisplay(plant).badgeColor
          const containerName = 'containerName' in plant ? (plant as any).containerName : null
          const label = getSuitabilityLabel(plant as any)
          return (
            <li
              key={plant.id}
              className="flex items-center gap-2 cursor-pointer rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-bg active:bg-bg transition-colors"
              onClick={() => onPlantTap(plant)}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="flex-1 min-w-0">
                <span className="text-xs text-text truncate block">{plant.name}</span>
                {containerName && (
                  <span className="text-[9px] text-text-muted truncate block">in {containerName}</span>
                )}
              </span>
              <span className="text-[9px] text-text-muted ml-auto shrink-0">
                {label}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
