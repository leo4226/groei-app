import type { CanvasData } from '../../types'
import EditorDefs from '../editor/EditorDefs'
import EditorZoneShape from '../editor/EditorZoneShape'
import RoomWallRenderer from '../editor/RoomWallRenderer'

interface Props {
  canvasData: CanvasData
}

// Stable no-op handlers — view mode has no interactivity
const noop = () => {}

/**
 * Read-only renderer for house/garden canvas_data zones.
 * Uses RoomWallRenderer for indoor rooms/structures (room walls, door/window gaps,
 * thickness auto-detect), and EditorZoneShape for outdoor / ground zones.
 */
export default function CanvasZonesLayer({ canvasData }: Props) {
  const { zones, wallElements = [], scale_px_per_m, canvas_w, canvas_h } = canvasData

  return (
    <g>
      {/* SVG pattern defs (hatching, textures, etc.) */}
      <EditorDefs />

      {/* Canvas background */}
      <rect width={canvas_w} height={canvas_h} fill="#f5f3ee" />

      {zones.map((zone) => {
        const isIndoorZone = zone.type === 'room' || zone.type === 'structure'
        return isIndoorZone ? (
          <RoomWallRenderer
            key={zone.id}
            zone={zone}
            zones={zones}
            isSelected={false}
            scalePxPerM={scale_px_per_m}
            wallElements={wallElements}
            selectedWallElementId={null}
            onPointerDown={noop}
            onSelectWallElement={noop}
            onWallElementPointerDown={noop}
          />
        ) : (
          <EditorZoneShape
            key={zone.id}
            zone={zone}
            zones={zones}
            isSelected={false}
            scalePxPerM={scale_px_per_m}
            wallElements={wallElements}
            selectedWallElementId={null}
            onPointerDown={noop}
            onSelectWallElement={noop}
            onWallElementPointerDown={noop}
          />
        )
      })}
    </g>
  )
}
