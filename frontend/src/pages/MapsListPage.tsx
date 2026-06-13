import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { useT } from '../context/LanguageContext'
import type { MapInfo } from '../types'

function MapThumbnail({ map }: { map: MapInfo }) {
  const isOutdoor = map.map_type === 'outdoor' || (map.map_type as string) === 'garden'
  const baseColor = isOutdoor ? '#7A9E5A' : '#E8E0D0'
  const accentColor = isOutdoor ? '#C8A96A' : '#C8A060'

  if (map.thumbnail_file) {
    return (
      <div className="bg-[#f5f3ef] rounded-xl h-44 flex items-center justify-center overflow-hidden mb-3">
        <img
          src={`/maps/${map.thumbnail_file}`}
          alt={map.name}
          className="w-full h-full object-contain"
        />
      </div>
    )
  }

  return (
    <div className="bg-[#f5f3ef] rounded-xl h-44 flex items-center justify-center overflow-hidden mb-3">
      <svg viewBox="0 0 120 80" width="150" height="120">
        <rect x="0" y="0" width="120" height="80" fill={baseColor} opacity="0.08" />
        <rect x="10" y="8" width="100" height="64" rx="4" fill={baseColor} opacity="0.25" />
        <rect x="20" y="18" width="38" height="22" rx="3" fill={accentColor} opacity="0.45" />
        <rect x="62" y="18" width="38" height="22" rx="3" fill={accentColor} opacity="0.35" />
        <rect x="20" y="46" width="38" height="20" rx="3" fill={accentColor} opacity="0.3" />
        <rect x="62" y="46" width="38" height="20" rx="3" fill={accentColor} opacity="0.4" />
        <line x1="10" y1="8" x2="110" y2="72" stroke={baseColor} strokeWidth="0.4" opacity="0.15" />
        <line x1="110" y1="8" x2="10" y2="72" stroke={baseColor} strokeWidth="0.4" opacity="0.15" />
      </svg>
    </div>
  )
}

export default function MapsListPage() {
  const t = useT()
  const maps = useFloreren(s => s.maps)
  const isLoading = useFloreren(s => s.isLoading)
  const loadMaps = useFloreren(s => s.loadMaps)
  const createMap = useFloreren(s => s.createMap)
  const deleteMap = useFloreren(s => s.deleteMap)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newMapType, setNewMapType] = useState<'outdoor' | 'indoor'>('outdoor')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => { loadMaps() }, [loadMaps])

  async function handleCreate() {
    if (!newName.trim() || creating) return
    setCreating(true)
    setError(null)
    try {
      const map = await createMap({ name: newName.trim(), map_type: newMapType })
      setShowCreate(false)
      setNewName('')
      navigate(`/maps/${map.id}/edit-layout`)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.maps.failedCreate)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(map: MapInfo) {
    if (!confirm(`Delete "${map.name}"?`)) return
    setError(null)
    try {
      await deleteMap(map.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.maps.failedDelete)
    }
  }

  if (isLoading) {
    return <div className="p-6 text-text-muted text-center">{t.maps.loading}</div>
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      {error && (
        <div className="bg-overdue/10 text-overdue text-sm px-3 py-2 rounded-lg mb-3 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold ml-2">✕</button>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-text">{t.maps.title}</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          {t.maps.newMap}
        </button>
      </div>

      {showCreate && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-4">
          <label className="text-sm text-text-muted block mb-1">{t.maps.mapNameLabel}</label>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder={t.maps.mapNamePlaceholder}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-bg text-text mb-3"
          />
          <label className="text-sm text-text-muted block mb-1">{t.mapSettings.typeLabel}</label>
          <div className="flex gap-2 mb-3">
            {(['outdoor', 'indoor'] as const).map(mapType => (
              <button
                key={mapType}
                onClick={() => setNewMapType(mapType)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  newMapType === mapType
                    ? 'bg-primary text-white border-primary'
                    : 'bg-bg text-text-muted border-border'
                }`}
              >
                {mapType === 'outdoor' ? t.maps.outdoor : t.maps.indoor}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewName(''); setNewMapType('outdoor') }}
              className="text-text-muted px-4 py-2 text-sm"
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {maps.map((map) => (
          <div key={map.id} className="bg-surface border border-border rounded-xl p-4">
            <MapThumbnail map={map} />
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-text">{map.name}</h2>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${map.map_type === 'indoor' ? 'bg-sky-blue/10 text-sky-blue' : 'bg-emerald-green/10 text-emerald-green'}`}>
                  {map.map_type === 'indoor' ? t.maps.indoor : t.maps.outdoor}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => navigate(`/maps/${map.id}/settings`)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:bg-bg hover:text-text transition-colors"
                  title={t.mapSettings.pageTitle}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(map)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-overdue transition-colors"
                  title={t.common.delete}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigate(`/map/${map.slug}`)}
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm text-text font-medium"
              >
                View
              </button>
              {map.canvas_data ? (
                <button
                  onClick={() => navigate(`/maps/${map.id}/edit-layout`)}
                  className="flex-1 border border-primary/30 bg-primary/5 rounded-lg px-3 py-2 text-sm text-primary font-medium"
                >
                  Edit layout
                </button>
              ) : (
                <div className="flex-1 border border-border rounded-lg px-3 py-2 text-sm text-text-muted text-center opacity-50">
                  SVG import
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
