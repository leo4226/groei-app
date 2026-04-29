import type { ZoneStyleType } from '../../types'

export interface ZoneStyle {
  fill: string
  patternId?: string
  patternOpacity?: number
  stroke: string
  strokeWidth: number
  opacity: number
  label: string
  chipColor: string
}

export const ZONE_STYLES: Record<ZoneStyleType, ZoneStyle> = {
  deck:      { fill: '#C8A96A', patternId: 'deckp', patternOpacity: 0.55, stroke: 'rgba(222,220,209,0.3)', strokeWidth: 1, opacity: 1, label: 'Deck', chipColor: '#C8A96A' },
  soil:      { fill: '#9B7A3A', patternId: 'soilp', patternOpacity: 1, stroke: 'rgba(222,220,209,0.15)', strokeWidth: 0.5, opacity: 0.4, label: 'Soil', chipColor: '#9B7A3A' },
  gravel:    { fill: '#ccc', patternId: 'gravelp', patternOpacity: 1, stroke: 'rgba(222,220,209,0.15)', strokeWidth: 0.5, opacity: 1, label: 'Gravel', chipColor: '#bbbbbb' },
  lawn:      { fill: '#7A9E5A', stroke: 'rgba(222,220,209,0.2)', strokeWidth: 0.8, opacity: 0.4, label: 'Lawn', chipColor: '#7A9E5A' },
  wall:      { fill: '#262624', stroke: 'rgba(222,220,209,0.4)', strokeWidth: 1.5, opacity: 1, label: 'Wall', chipColor: '#444444' },
  path:      { fill: '#D4C9A8', stroke: 'none', strokeWidth: 0, opacity: 0.6, label: 'Path', chipColor: '#D4C9A8' },
  room:      { fill: '#E8E0D0', stroke: 'rgba(100,80,60,0.2)', strokeWidth: 1, opacity: 0.5, label: 'Room', chipColor: '#E8E0D0' },
  water:     { fill: '#3B8BD4', stroke: 'rgba(60,130,200,0.3)', strokeWidth: 1, opacity: 0.4, label: 'Water', chipColor: '#3B8BD4' },
  structure: { fill: '#C8A060', stroke: '#8a6030', strokeWidth: 1.2, opacity: 1, label: 'Structure', chipColor: '#C8A060' },
}

export const ZONE_TYPE_ORDER: ZoneStyleType[] = [
  'deck', 'soil', 'gravel', 'lawn', 'wall', 'path', 'room', 'water', 'structure',
]

export default function EditorDefs() {
  return (
    <defs>
      <pattern id="deckp" width="6" height="6" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="6" y2="0" stroke="#8B6914" strokeWidth="0.7" opacity="0.3" />
      </pattern>
      <pattern id="soilp" width="7" height="7" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1" fill="#6B4C11" opacity="0.2" />
        <circle cx="5.5" cy="5.5" r="0.7" fill="#6B4C11" opacity="0.15" />
      </pattern>
      <pattern id="gravelp" width="5" height="5" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="1.5" r="0.9" fill="#999" opacity="0.35" />
        <circle cx="4" cy="4" r="0.7" fill="#999" opacity="0.22" />
      </pattern>
      <pattern id="editor-grid" width="23" height="23" patternUnits="userSpaceOnUse">
        <path d="M 23 0 L 0 0 0 23" fill="none" stroke="rgba(150,150,140,0.15)" strokeWidth="0.5" />
      </pattern>
    </defs>
  )
}
