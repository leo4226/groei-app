import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchMapById, updateMap } from '../api/client'
import type { MapInfo } from '../types'
import CompassBearingPicker from '../components/settings/CompassBearingPicker'
import { useT } from '../context/LanguageContext'
import { useFloreren } from '../store/useFloreren'

export default function MapSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const t = useT()
  const mapId = Number(id)
  const deleteMap = useFloreren(s => s.deleteMap)

  const [map, setMap] = useState<MapInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [mapType, setMapType] = useState<'outdoor' | 'indoor'>('outdoor')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [bearing, setBearing] = useState(0)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    fetchMapById(mapId).then(m => {
      if (!mounted.current) return
      setMap(m)
      setName(m.name)
      setMapType((m.map_type as 'outdoor' | 'indoor') || 'outdoor')
      setLat(m.lat != null ? String(m.lat) : '')
      setLon(m.lon != null ? String(m.lon) : '')
      setBearing(m.bearing ?? 0)
      setLoading(false)
    }).catch(e => {
      if (mounted.current) setError(t.mapSettings.notFound)
      setLoading(false)
    })
    return () => { mounted.current = false }
  }, [mapId])

  const doSave = useCallback((fields: Record<string, unknown>) => {
    if (!mapId) return
    setSaveStatus('saving')
    updateMap(mapId, fields).then(updated => {
      if (mounted.current) {
        setMap(updated)
        setSaveStatus('saved')
        setTimeout(() => {
          if (mounted.current && saveStatus === 'saved') setSaveStatus('idle')
        }, 1500)
      }
    }).catch(() => {
      if (mounted.current) setSaveStatus('idle')
    })
  }, [mapId])

  const debouncedSave = useCallback((fields: Record<string, unknown>) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(fields), 600)
  }, [doSave])

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  function handleNameChange(val: string) {
    setName(val)
    debouncedSave({ name: val })
  }

  function handleTypeChange(type: 'outdoor' | 'indoor') {
    setMapType(type)
    doSave({ map_type: type })
  }

  function handleLatChange(val: string) {
    setLat(val)
    const n = parseFloat(val)
    if (!isNaN(n)) debouncedSave({ lat: n })
  }

  function handleLonChange(val: string) {
    setLon(val)
    const n = parseFloat(val)
    if (!isNaN(n)) debouncedSave({ lon: n })
  }

  function handleBearingChange(b: number) {
    setBearing(b)
    debouncedSave({ bearing: b })
  }

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = pos.coords.latitude.toFixed(6)
        const lo = pos.coords.longitude.toFixed(6)
        setLat(la)
        setLon(lo)
        doSave({ lat: parseFloat(la), lon: parseFloat(lo) })
      },
      () => setError(t.mapSettings.locationUnavailable),
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteMap(mapId)
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : t.mapSettings.deleteFailed)
      setDeleting(false)
      setDeleteConfirm(false)
    }
  }

  // Parse canvas_data for dimension display
  const dimensions = (() => {
    if (!map?.canvas_data) return null
    try {
      const d = JSON.parse(map.canvas_data)
      const scale = d.scale_px_per_m || 46
      const wM = (d.canvas_w || 680) / scale
      const hM = (d.canvas_h || 680) / scale
      return { w: wM.toFixed(1), h: hM.toFixed(1) }
    } catch { return null }
  })()

  if (loading) {
    return (
      <div className="p-4 max-w-lg mx-auto">
        <div className="h-8 w-48 bg-surface rounded-lg animate-pulse mb-4" />
        <div className="h-64 bg-surface rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (error || !map) {
    return (
      <div className="p-4 text-center text-text-muted">
        <p>{error || t.mapSettings.notFound}</p>
        <button onClick={() => navigate('/maps')} className="mt-2 text-primary text-sm font-medium">
          {t.mapSettings.backToMaps}
        </button>
      </div>
    )
  }

  const isOutdoor = mapType === 'outdoor'

  return (
    <div className="p-4 max-w-lg mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-surface hover:bg-surface/80 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-text">{t.mapSettings.pageTitle}</h1>
        {saveStatus === 'saving' && <span className="text-xs text-text-muted">{t.mapSettings.saving}</span>}
        {saveStatus === 'saved' && <span className="text-xs text-emerald-green">{t.mapSettings.saved}</span>}
      </div>

      {/* Naam */}
      <section className="mb-6">
        <label className="text-sm font-medium text-text-muted block mb-1.5">{t.mapSettings.nameLabel}</label>
        <input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder={t.mapSettings.namePlaceholder}
          className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-bg text-text"
        />
      </section>

      {/* Type */}
      <section className="mb-6">
        <label className="text-sm font-medium text-text-muted block mb-1.5">{t.mapSettings.typeLabel}</label>
        <div className="flex gap-2">
          {(['outdoor', 'indoor'] as const).map(type => (
            <button
              key={type}
              onClick={() => handleTypeChange(type)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                mapType === type
                  ? 'bg-primary text-white border-primary'
                  : 'bg-bg text-text-muted border-border hover:bg-surface'
              }`}
            >
              {type === 'outdoor' ? t.mapSettings.outdoor : t.mapSettings.indoor}
            </button>
          ))}
        </div>
      </section>

      {/* GPS location (outdoor only) */}
      {isOutdoor && (
        <section className="mb-6">
          <label className="text-sm font-medium text-text-muted block mb-1.5">{t.mapSettings.location}</label>
          <div className="flex gap-2 mb-2">
            <div className="flex-1">
              <label className="text-xs text-text-muted block mb-0.5">{t.mapSettings.latLabel}</label>
              <input
                value={lat}
                onChange={(e) => handleLatChange(e.target.value)}
                placeholder={t.mapSettings.latPlaceholder}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-bg text-text"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-text-muted block mb-0.5">{t.mapSettings.lonLabel}</label>
              <input
                value={lon}
                onChange={(e) => handleLonChange(e.target.value)}
                placeholder={t.mapSettings.lonPlaceholder}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-bg text-text"
              />
            </div>
          </div>
          <button
            onClick={handleUseCurrentLocation}
            className="w-full py-2 rounded-xl border border-border text-sm text-text-muted hover:bg-surface transition-colors"
          >
            {t.mapSettings.useCurrentLocation}
          </button>
        </section>
      )}

      {/* Compass bearing (outdoor only) */}
      {isOutdoor && (
        <section className="mb-6">
          <label className="text-sm font-medium text-text-muted block mb-1.5">{t.mapSettings.compassBearing}</label>
          <p className="text-xs text-text-muted mb-3" dangerouslySetInnerHTML={{ __html: t.mapSettings.compassHint }} />
          <div className="flex justify-center">
            <CompassBearingPicker value={bearing} onChange={handleBearingChange} />
          </div>
        </section>
      )}

      {/* Dimensions (read-only) */}
      {dimensions && (
        <section className="mb-6">
          <label className="text-sm font-medium text-text-muted block mb-1.5">{t.mapSettings.dimensions}</label>
          <p className="text-sm text-text bg-surface rounded-xl px-4 py-2.5">
            {dimensions.w}m breed &times; {dimensions.h}m diep
          </p>
          <p className="text-xs text-text-muted mt-1">
            {t.mapSettings.dimensionsHint}
          </p>
        </section>
      )}

      {/* Navigation back to editor */}
      <button
        onClick={() => navigate(`/maps/${mapId}/edit-layout`)}
        className="w-full py-3 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
      >
        {t.mapSettings.editLayout}
      </button>

      {/* Danger zone */}
      <div className="mt-10 pt-6 border-t border-border">
        <p className="text-xs font-medium text-text-muted uppercase tracking-widest mb-3">{t.mapSettings.dangerZone}</p>
        {!deleteConfirm ? (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="w-full py-3 rounded-xl border border-red-300 text-red-500 text-sm font-semibold hover:bg-red-50 transition-colors"
          >
            {t.mapSettings.deleteMap}
          </button>
        ) : (
          <div className="rounded-xl border border-red-300 overflow-hidden">
            <p className="text-sm text-text px-4 pt-4 pb-3">
              {t.mapSettings.deleteConfirm}
            </p>
            <div className="flex border-t border-red-200">
              <button
                onClick={() => setDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 py-3 text-sm text-text-muted hover:bg-surface transition-colors border-r border-red-200"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-3 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors"
              >
                {deleting ? t.mapSettings.deleting : t.mapSettings.confirmDelete}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
