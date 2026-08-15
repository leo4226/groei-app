import type { CareWarningOut, MapPlant, MapObject } from '../../types'
import { useT } from '../../context/LanguageContext'
import { useState } from 'react'
import {
  buildCareNeedsGroups,
  getCareTypeDisplay,
  isWeatherWarning,
  localizedWarningCopy,
  localizedWeatherWarningCopy,
  type LocalizedWarningCopy,
  type WarningPlant,
  type PlantWithMeta,
} from './careNeedsListModel'
import { plantDisplayName } from '../../utils/plantDisplayName'
import CareIcon, { type CareIconType } from '../ui/CareIcon'

interface Props {
  plants: MapPlant[]
  objects: MapObject[]
  onPlantTap: (plant: MapPlant) => void
}

export default function CareNeedsList({ plants, objects, onPlantTap }: Props) {
  const t = useT()
  const { groups, goodPlants } = buildCareNeedsGroups(plants, objects)

  if (groups.length === 0 && goodPlants.length === 0) return null

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <CareTypeGroup
          key={group.careType}
          careType={group.careType}
          plants={group.plants}
          plantCount={group.plants.length}
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

function WeatherWarningInline({ copy, t }: { copy: LocalizedWarningCopy; t: ReturnType<typeof useT> }) {
  return (
    <span className="mt-1 block space-y-0.5 text-[9px] leading-snug text-text-muted">
      {copy.reason && <span className="block">{copy.reason}</span>}
      {copy.action && (
        <span className="block">
          <span className="font-semibold text-text">{t.mapPage.weatherWarningAction}: </span>
          {copy.action}
        </span>
      )}
    </span>
  )
}

function CareTypeGroup({
  careType,
  plants,
  plantCount,
  onPlantTap,
}: {
  careType: string
  plants: WarningPlant[]
  plantCount: number
  onPlantTap: (p: MapPlant) => void
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const info = getCareTypeDisplay(careType, t)
  const dotColor = plants[0]?.warning.color ?? '#ea0706'
  const weatherCopy = localizedWeatherWarningCopy(plants, t)

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
        <span className="shrink-0 flex items-center" style={{ color: dotColor }}><CareIcon type={careType as CareIconType} size={13} strokeWidth={2} /></span>
        <span className="text-xs text-text font-medium flex-1 min-w-0 truncate">
          {info.label}
        </span>
        {weatherCopy && (
          <span className="px-1.5 py-0.5 rounded-full bg-aqua-glow/10 text-aqua-glow text-[8px] font-semibold uppercase tracking-wide shrink-0">
            {t.mapPage.weatherWarningBadge}
          </span>
        )}
        <span className="text-[10px] text-text-muted tabular-nums shrink-0">
          {plantCount}
        </span>
        <span className="text-[8px] text-text-muted shrink-0 transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▼
        </span>
      </button>
      {expanded && (
        <ul className="pl-6 space-y-0.5 mt-0.5 border-l border-border/30 ml-2.5">
          {plants.map((plant) => (
            <PlantRow
              key={`${plant.id}-${plant.warning.care_type}`}
              plant={plant}
              onTap={onPlantTap}
              dotColor={plant.warning.color ?? dotColor}
              careType={plant.warning.care_type}
              warning={plant.warning}
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
  careType,
  warning,
}: {
  plant: PlantWithMeta
  onTap: (p: MapPlant) => void
  dotColor: string
  careType?: string
  warning?: CareWarningOut
}) {
  const containerName = plant.containerName ?? null
  const t = useT()
  const displayName = plantDisplayName(plant, t.locale)
  const weatherCopy = warning && isWeatherWarning(warning)
    ? localizedWarningCopy(warning, t)
    : null

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
        <span className="text-xs text-text truncate block">{displayName}</span>
        {containerName && (
          <span className="text-[9px] text-text-muted truncate block">in {containerName}</span>
        )}
        {weatherCopy && <WeatherWarningInline copy={weatherCopy} t={t} />}
      </span>
      {careType && (
        <span className="shrink-0 flex items-center" style={{ color: dotColor }}>
          <CareIcon type={careType as CareIconType} size={12} strokeWidth={2} />
        </span>
      )}
    </li>
  )
}
