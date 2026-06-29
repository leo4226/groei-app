import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../context/LanguageContext'
import { maps as mapsApi } from '../../api/client'
import { gameApi } from '../../api/game'
import type { MapPlant } from '../../types'
import { plantDisplayName } from '../../utils/plantDisplayName'
import Glyph from '../ui/Glyph'

interface Props {
  mapId: number
  mapSlug: string
  onClose: () => void
}

export default function GameSetupSheet({ mapId, mapSlug, onClose }: Props) {
  const t = useT()
  const navigate = useNavigate()
  const [plants, setPlants] = useState<MapPlant[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [clueMode, setClueMode] = useState<'photo' | 'name'>('photo')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    mapsApi.plants(mapSlug)
      .then((ps) => {
        setPlants(ps.filter((p) => p.photo_path))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [mapSlug])

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreate() {
    if (selected.size < 3 || selected.size > 10 || creating) return
    setCreating(true)
    setError(null)
    try {
      const { join_code } = await gameApi.create(mapId, Array.from(selected), clueMode)
      navigate(`/game/${join_code}/host`)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.common.error)
      setCreating(false)
    }
  }

  const canCreate = selected.size >= 3 && selected.size <= 10

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black/40" onClick={onClose}>
      <div
        className="mt-auto bg-surface rounded-t-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div>
            <h2 className="font-bold text-text">{t.game.setupTitle}</h2>
            <p className="text-xs text-text-muted mt-0.5">{t.game.setupSubtitle}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-bg text-text-muted hover:text-text">
            <Glyph name="x" size={16} />
          </button>
        </div>

        {/* Clue mode toggle */}
        <div className="px-5 pb-3 flex-shrink-0">
          <p className="text-xs text-text-muted mb-2">{t.game.clueModeSectionLabel}</p>
          <div className="flex rounded-xl overflow-hidden border border-border">
            <button
              onClick={() => setClueMode('photo')}
              className={`flex-1 py-2 text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${
                clueMode === 'photo' ? 'bg-primary text-white' : 'bg-bg text-text-muted hover:bg-surface'
              }`}
            >
              <Glyph name="camera" size={15} />
              {t.game.clueModePhoto}
            </button>
            <button
              onClick={() => setClueMode('name')}
              className={`flex-1 py-2 text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${
                clueMode === 'name' ? 'bg-primary text-white' : 'bg-bg text-text-muted hover:bg-surface'
              }`}
            >
              <Glyph name="text" size={15} />
              {t.game.clueModeName}
            </button>
          </div>
        </div>

        {/* Notice about photos */}
        <div className="px-5 pb-3 flex-shrink-0">
          <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 flex items-start gap-1.5">
            <Glyph name="camera" size={14} className="shrink-0 mt-0.5" />
            <span>{t.game.noPhotosWarning}</span>
          </p>
        </div>

        {/* Plant list */}
        <div className="overflow-y-auto flex-1 px-5 pb-2">
          {loading ? (
            <p className="text-text-muted text-sm py-4">{t.common.loading}</p>
          ) : plants.length === 0 ? (
            <p className="text-text-muted text-sm py-4">{t.game.noPhotosWarning}</p>
          ) : (
            <div className="space-y-2">
              {plants.map((p) => {
                const sel = selected.has(p.id)
                const displayName = plantDisplayName(p, t.locale)
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                      sel ? 'border-primary bg-primary/8' : 'border-border bg-bg hover:bg-surface'
                    }`}
                  >
                    {p.photo_path ? (
                      <img src={p.photo_path} alt={displayName} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-border flex items-center justify-center text-text-muted flex-shrink-0"><Glyph name="sprout" size={22} /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${sel ? 'text-primary' : 'text-text'}`}>{displayName}</p>
                      {p.species && <p className="text-xs text-text-muted truncate">{p.species}</p>}
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${sel ? 'border-primary bg-primary' : 'border-border'}`}>
                      {sel && <Glyph name="check" size={13} className="text-white" />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom,0px),20px)] flex-shrink-0 border-t border-border space-y-3">
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          {!canCreate && selected.size > 0 && (
            <p className="text-xs text-text-muted text-center">
              {selected.size < 3 ? t.game.selectMin : t.game.selectMax}
            </p>
          )}
          <button
            onClick={handleCreate}
            disabled={!canCreate || creating}
            className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-40 transition-opacity"
          >
            {creating ? t.game.creating : `${t.game.createGame} (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  )
}
