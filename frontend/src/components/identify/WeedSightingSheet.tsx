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

// Sightings get pinned on a (potentially shared household) map, so we gate the
// first save behind an explicit privacy acknowledgement. Acked-once is stored
// in localStorage; subsequent saves don't re-prompt.
const PRIVACY_ACK_KEY = 'groei.identify.privacy_ack'

export function WeedSightingSheet({ weedId, weedName, preselectedMapId, preselectedMapSlug, onSaved, onCancel }: Props) {
  const t = useT()
  const maps = useFloreren((s) => s.maps)
  const outdoorMaps = maps.filter((m) => m.map_type === 'outdoor')

  const [selectedMapId, setSelectedMapId] = useState<number | null>(preselectedMapId ?? null)
  const [selectedMapSlug, setSelectedMapSlug] = useState<string | null>(preselectedMapSlug ?? null)
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsPrivacyAck, setNeedsPrivacyAck] = useState(false)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const selectedMap = maps.find((m) => m.id === selectedMapId) ?? null

  function handleMapPick(mapId: number, mapSlug: string) {
    setSelectedMapId(mapId)
    setSelectedMapSlug(mapSlug)
    setPin(null)
  }

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return
    const coords = screenToSVG(svgRef.current, e.clientX, e.clientY)
    if (!coords) return
    const { x, y } = coords
    setPin({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 })
  }

  async function handleConfirm() {
    if (!selectedMapId || !selectedMapSlug || !pin) return
    if (localStorage.getItem(PRIVACY_ACK_KEY) !== '1') {
      setNeedsPrivacyAck(true)
      return
    }
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

  function ackPrivacyAndSave() {
    localStorage.setItem(PRIVACY_ACK_KEY, '1')
    setNeedsPrivacyAck(false)
    void handleConfirm()
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

      {needsPrivacyAck && (
        <div className="fixed inset-0 z-[60] bg-bg/95 flex flex-col items-center justify-center p-8 gap-6 text-center">
          <span className="text-5xl">🌿</span>
          <p className="text-sm text-text-muted leading-relaxed max-w-xs">{t.weeds.privacy.notice}</p>
          <button
            onClick={ackPrivacyAndSave}
            className="w-full max-w-xs py-3 rounded-xl bg-primary text-white font-medium"
          >
            {t.weeds.privacy.ack}
          </button>
          <button onClick={() => setNeedsPrivacyAck(false)} className="text-sm text-text-muted">
            {t.weeds.sightingSheet.cancel}
          </button>
        </div>
      )}
    </div>
  )
}
