import type { MapPlant, MapObject } from '../../types'
import { SEVERITY_HALO_COLORS } from '../../hooks/usePlantStatus'
import { useT } from '../../context/LanguageContext'

interface Props {
  plants: MapPlant[]
  objects: MapObject[]
  onPlantTap: (plant: MapPlant) => void
}

type PlantWithMeta = MapPlant & { containerName?: string }

export default function MapLegend({ plants, objects, onPlantTap }: Props) {
  const t = useT()
  const containedPlants: PlantWithMeta[] = objects.flatMap((obj) =>
    obj.contained_plants.map((p) => ({ ...p, containerName: obj.name }))
  )

  const allPlants: PlantWithMeta[] = [...plants, ...containedPlants].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  )

  if (allPlants.length === 0) return null

  const alertPlants = allPlants.filter(p => p.top_alert !== null)
  const goodPlants  = allPlants.filter(p => p.top_alert === null)

  return (
    <div className="bg-surface/95 backdrop-blur-sm rounded-xl border border-border shadow-sm p-3 min-w-[150px]">
      {alertPlants.length > 0 && (
        <>
          <h3 className="text-[9px] font-semibold text-overdue uppercase tracking-wider mb-1.5">
            {t.mapLegend.attentionNeeded}
          </h3>
          <ul className="space-y-1 mb-3">
            {alertPlants.map(plant => (
              <PlantRow key={plant.id} plant={plant} onTap={onPlantTap} />
            ))}
          </ul>
        </>
      )}
      {goodPlants.length > 0 && (
        <>
          <h3 className="text-[9px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
            {t.mapLegend.allGood}
          </h3>
          <ul className="space-y-1">
            {goodPlants.map(plant => (
              <PlantRow key={plant.id} plant={plant} onTap={onPlantTap} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function PlantRow({ plant, onTap }: { plant: PlantWithMeta; onTap: (p: MapPlant) => void }) {
  const dotColor = plant.top_alert
    ? SEVERITY_HALO_COLORS[plant.top_alert.severity]
    : '#24e34c'
  const containerName = plant.containerName ?? null

  return (
    <li
      className="flex items-center gap-2 cursor-pointer rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-bg active:bg-bg transition-colors"
      onClick={() => onTap(plant)}
    >
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: dotColor }}
      />
      <span className="flex-1 min-w-0">
        <span className="text-xs text-text truncate block">{plant.name}</span>
        {containerName && (
          <span className="text-[9px] text-text-muted truncate block">in {containerName}</span>
        )}
      </span>
      {plant.top_alert && (
        <span className="text-[11px] shrink-0" title={plant.top_alert.alert_type}>
          {plant.top_alert.icon}
        </span>
      )}
    </li>
  )
}
