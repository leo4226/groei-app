import { useRef, useState } from 'react'
import { weeds } from '../../api/client'
import { useT } from '../../context/LanguageContext'
import { useFloreren } from '../../store/useFloreren'
import { screenToSVG } from '../../utils/svgCoords'

interface Props {
  weedId: number
  weedName: string
  preselectedMapId?: number
  preselectedMapSlug?: string
  onSaved: (mapSlug: string) => void
  onCancel: () => void
}

export function WeedSightingSheet({ weedId, weedName, preselectedMapId, preselectedMapSlug, onSaved, onCancel }: Props) {
  const t = useT()
  const maps = useFloreren((s) => s.maps)
  const outdoorMaps = maps.filter((m) => m.map_type === 'outdoor')

  const [selectedMapId, setSelectedMapId] = useState<number | null>(preselectedMapId ?? null)
  const [selectedMapSlug, setSelectedMapSlug] = useState<string | null>(preselectedMapSlug ?? null)
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const selectedMap = maps.find((m) => m.id === selectedMapId) ?? null

  function handleMapPick(mapId: number, mapSlug: string) {
    setSelectedMapId(mapId)
    setSelectedMapSlug(mapSlug)
    setPin(null)
  }

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return
    const { x, y } = screenToSVG(svgRef.current, e.clientX, e.clientY)
    setPin({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 })
  }

  async function handleConfirm() {
    if (!selectedMapId || !selectedMapSlug || !pin) return
    setSaving(true)
    setError(null)
    try {
      await weeds.createSighting({
        weed_id: weedId,
        map_id: selectedMapId,
        map_x: pin.x,
        map_y: pin.y,
        sighted_at: new Date().toISOString(),
      })
      onSaved(selectedMapSlug)
    } catch {
      setError('Opslaan mislukt — probeer opnieuw.')
      setSaving(false)
    }
  }

  const viewBox = selectedMap?.canvas_data
    ? (() => {
        try {
          const d = JSON.parse(selectedMap.canvas_data)
          return d.viewBox ?? '0 0 680 680'
        } catch { return '0 0 680 680' }
      })()
    : '0 0 680 680'

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <button onClick={onCancel} className="text-text-muted text-sm">{t.weeds.sightingSheet.cancel}</button>
        <span className="text-sm font-semibold text-text">{t.weeds.sightingSheet.title}</span>
        <span className="w-12" />
      </div>

      <div className="p-4 text-sm text-text-muted">
        <span className="font-medium text-text">{weedName}</span>
      </div>

      {/* Map picker */}
      {!selectedMapId && (
        <div className="flex flex-col gap-2 px-4">
          <p className="text-sm font-medium text-text mb-1">{t.weeds.sightingSheet.pickMap}</p>
          {outdoorMaps.map((m) => (
            <button
              key={m.id}
              onClick={() => handleMapPick(m.id, m.slug)}
              className="card p-3 text-left text-sm font-medium text-text hover:border-primary/30"
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      {/* Pin placement */}
      {selectedMapId && (
        <div className="flex flex-col flex-1 gap-3 px-4 overflow-hidden">
          <p className="text-sm text-text-muted">{t.weeds.sightingSheet.pinInstruction}</p>
          <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-border">
            <svg
              ref={svgRef}
              viewBox={viewBox}
              className="w-full h-full"
              onClick={handleSvgClick}
              style={{ cursor: 'crosshair', background: '#E8E0CC' }}
            >
              {pin && (
                <circle cx={pin.x} cy={pin.y} r={8} fill="#ef4444" stroke="white" strokeWidth={2} />
              )}
            </svg>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            onClick={handleConfirm}
            disabled={!pin || saving}
            className="w-full py-3 rounded-xl bg-primary text-white font-medium text-sm disabled:opacity-40"
          >
            {saving ? '…' : t.weeds.sightingSheet.confirm}
          </button>
        </div>
      )}
    </div>
  )
}
