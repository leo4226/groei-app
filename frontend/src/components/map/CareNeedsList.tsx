import type { MapPlant, MapObject } from '../../types'
import { useT } from '../../context/LanguageContext'
import { useState } from 'react'

interface Props {
  plants: MapPlant[]
  objects: MapObject[]
  onPlantTap: (plant: MapPlant) => void
}

type PlantWithMeta = MapPlant & { containerName?: string }

// Care type → display (covers both legacy and new pipeline care_type values)
const WARNING_LABEL: Record<string, { icon: string; label: string }> = {
  water:         { icon: '💧', label: 'Water' },
  fertilize:     { icon: '🧪', label: 'Mest' },
  mist:          { icon: '🌫️', label: 'Bevochtigen' },
  rotate:        { icon: '🔄', label: 'Draaien' },
  repot:         { icon: '🪴', label: 'Verpotten' },
  prune:         { icon: '✂️', label: 'Snoeien' },
  pest_check:    { icon: '🐛', label: 'Luizen-check' },
  dust:          { icon: '🧽', label: 'Afnemen' },
  protect_cold:  { icon: '🧤', label: 'Vorst' },
  protect_heat:  { icon: '🧴', label: 'Hitte' },
  frost_protect: { icon: '❄️', label: 'Vorst' },
  heat_protect:  { icon: '🔥', label: 'Hitte' },
}

export default function CareNeedsList({ plants, objects, onPlantTap }: Props) {
  const t = useT()
  const containedPlants: PlantWithMeta[] = objects.flatMap((obj) =>
    obj.contained_plants.map((p) => ({ ...p, containerName: obj.name }))
  )

  const allPlants: PlantWithMeta[] = [...plants, ...containedPlants].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  )

  if (allPlants.length === 0) return null

  // Group plants that have a top_warning by care_type
  const warningPlants = allPlants.filter(p => p.top_warning !== null)
  const goodPlants = allPlants.filter(p => p.top_warning === null)

  // Build care-type groups
  const groups = new Map<string, PlantWithMeta[]>()
  for (const p of warningPlants) {
    const ct = p.top_warning!.care_type
    if (!groups.has(ct)) groups.set(ct, [])
    groups.get(ct)!.push(p)
  }

  // Sort groups: largest count first, then alphabetical
  const sortedGroups = [...groups.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length
    return a[0].localeCompare(b[0])
  })

  return (
    <div className="space-y-2">
      {sortedGroups.map(([careType, plants]) => (
        <CareTypeGroup
          key={careType}
          careType={careType}
          plants={plants}
          plantCount={plants.length}
          onPlantTap={onPlantTap}
        />
      ))}
      {goodPlants.length > 0 && (
        <>
          <h3 className="text-[9px] font-semibold text-text-muted uppercase tracking-wider mb-1.5 mt-2">
            {t.mapLegend.allGood}
          </h3>
          <ul className="space-y-1">
            {goodPlants.map(plant => (
              <PlantRow key={plant.id} plant={plant} onTap={onPlantTap} dotColor="#24e34c" />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function CareTypeGroup({
  careType,
  plants,
  plantCount,
  onPlantTap,
}: {
  careType: string
  plants: (MapPlant & { containerName?: string })[]
  plantCount: number
  onPlantTap: (p: MapPlant) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const info = WARNING_LABEL[careType] ?? { icon: '⚙️', label: careType }
  const dotColor = plants[0]?.top_warning?.color ?? '#ea0706'

  return (
    <div className="mb-1.5 last:mb-0">
      <button
        className="flex items-center gap-2 w-full cursor-pointer rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-bg active:bg-bg transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: dotColor }}
        />
        <span className="text-[11px]">{info.icon}</span>
        <span className="text-xs text-text font-medium flex-1 min-w-0 truncate">
          {info.label}
        </span>
        <span className="text-[10px] text-text-muted tabular-nums shrink-0">
          {plantCount}
        </span>
        <span className="text-[8px] text-text-muted shrink-0 transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▼
        </span>
      </button>
      {expanded && (
        <ul className="pl-6 space-y-0.5 mt-0.5 border-l border-border/30 ml-2.5">
          {plants.map(plant => (
            <PlantRow
              key={plant.id}
              plant={plant}
              onTap={onPlantTap}
              dotColor={plant.top_warning?.color ?? dotColor}
              icon={plant.top_warning?.icon ?? undefined}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function PlantRow({
  plant,
  onTap,
  dotColor,
  icon,
}: {
  plant: PlantWithMeta
  onTap: (p: MapPlant) => void
  dotColor: string
  icon?: string
}) {
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
      {icon && (
        <span className="text-[11px] shrink-0">{icon}</span>
      )}
    </li>
  )
}
