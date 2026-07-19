import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFloreren } from '../../store/useFloreren'
import { useT } from '../../context/LanguageContext'
import { maps as mapsApi } from '../../api/client'
import { buildStarterCanvas } from '../../demo/starterCanvas'
import Glyph from '../ui/Glyph'

interface Props {
  open: boolean
  onClose: () => void
}

type GeoStatus = 'idle' | 'busy' | 'done' | 'error'

export default function NewMapModal({ open, onClose }: Props) {
  const t = useT()
  const navigate = useNavigate()
  const createMap = useFloreren(s => s.createMap)
  const loadMaps = useFloreren(s => s.loadMaps)

  const [name, setName] = useState('')
  const [mapType, setMapType] = useState<'outdoor' | 'indoor'>('outdoor')
  // Soft first-run: outdoor gardens can start from a ready-made layout so new
  // users land on a working map instead of a blank editor canvas.
  const [starter, setStarter] = useState<'template' | 'empty'>('template')
  const [geo, setGeo] = useState<{ lat: number; lon: number } | null>(null)
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  function requestLocation() {
    if (geoStatus === 'busy' || !navigator.geolocation) return
    setGeoStatus('busy')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          lat: Math.round(pos.coords.latitude * 10000) / 10000,
          lon: Math.round(pos.coords.longitude * 10000) / 10000,
        })
        setGeoStatus('done')
      },
      () => setGeoStatus('error'),
      { timeout: 12000, maximumAge: 300000 },
    )
  }

  async function handleCreate() {
    if (!name.trim() || creating) return
    setCreating(true)
    setError(null)
    try {
      const useTemplate = mapType === 'outdoor' && starter === 'template'
      const map = await createMap({
        name: name.trim(),
        map_type: mapType,
        ...(mapType === 'outdoor' && geo ? { lat: geo.lat, lon: geo.lon } : {}),
      })
      if (useTemplate) {
        const canvas = buildStarterCanvas({
          fence: t.maps.starterZoneFence,
          backBorder: t.maps.starterZoneBackBorder,
          border: t.maps.starterZoneBorder,
          lawn: t.maps.starterZoneLawn,
          terrace: t.maps.starterZoneTerrace,
        })
        await mapsApi.update(map.id, { canvas_data: JSON.stringify(canvas) })
        await loadMaps()
      }
      setName('')
      setMapType('outdoor')
      setStarter('template')
      setGeo(null)
      setGeoStatus('idle')
      onClose()
      // Template starters land on the live map (first-run checklist already
      // half-done); empty starters go draw their layout in the editor.
      if (useTemplate) navigate(`/map/${map.slug}`)
      else navigate(`/maps/${map.id}/edit-layout`)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.maps.failedCreate)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-surface)', borderRadius: 16,
          padding: '28px 24px 24px', width: '100%', maxWidth: 400,
          border: '1px solid var(--color-border)',
        }}
      >
        <h2 style={{
          margin: '0 0 20px', fontFamily: 'var(--font-heading)', fontWeight: 500,
          fontSize: 22, color: 'var(--color-text)', letterSpacing: '-0.01em',
        }}>{t.dashboard.actions.newGarden}</h2>

        {error && (
          <div style={{
            background: 'var(--color-overdue-soft, rgba(200,60,60,.1))',
            color: 'var(--color-overdue)', fontSize: 13, borderRadius: 8,
            padding: '8px 12px', marginBottom: 16,
          }}>{error}</div>
        )}

        <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-text-muted)', marginBottom: 6 }}>
          {t.maps.mapNameLabel}
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder={t.maps.mapNamePlaceholder}
          style={{
            width: '100%', boxSizing: 'border-box',
            border: '1px solid var(--color-border)', borderRadius: 10,
            padding: '10px 14px', fontSize: 15,
            background: 'var(--color-bg)', color: 'var(--color-text)',
            fontFamily: 'var(--font-body)', marginBottom: 18, outline: 'none',
          }}
        />

        <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-text-muted)', marginBottom: 8 }}>
          {t.mapSettings.typeLabel}
        </label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {(['outdoor', 'indoor'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setMapType(type)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14,
                fontFamily: 'var(--font-body)', fontWeight: 500, cursor: 'pointer',
                border: `1px solid ${mapType === type ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: mapType === type ? 'var(--color-primary)' : 'var(--color-bg)',
                color: mapType === type ? '#fff' : 'var(--color-text-muted)',
                transition: 'all 0.12s',
              }}
            >
              {type === 'outdoor' ? t.maps.outdoor : t.maps.indoor}
            </button>
          ))}
        </div>

        {mapType === 'outdoor' && (
          <>
            {/* Starter layout choice */}
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-text-muted)', marginBottom: 8 }}>
              {t.maps.starterLabel}
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              {(['template', 'empty'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setStarter(opt)}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                    textAlign: 'left', fontFamily: 'var(--font-body)',
                    border: `1px solid ${starter === opt ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: starter === opt ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-bg))' : 'var(--color-bg)',
                    color: 'var(--color-text)',
                    transition: 'all 0.12s',
                  }}
                >
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: starter === opt ? 'var(--color-primary)' : 'var(--color-text)' }}>
                    {opt === 'template' ? t.maps.starterTemplate : t.maps.starterEmpty}
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.35, color: 'var(--color-text-muted)', marginTop: 3 }}>
                    {opt === 'template' ? t.maps.starterTemplateHint : t.maps.starterEmptyHint}
                  </span>
                </button>
              ))}
            </div>

            {/* Optional one-tap location for the sun simulation */}
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-text-muted)', marginBottom: 8 }}>
              {t.maps.locationLabel}
            </label>
            <div style={{ marginBottom: 6 }}>
              <button
                onClick={requestLocation}
                disabled={geoStatus === 'busy' || geoStatus === 'done'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '10px 12px', borderRadius: 10, cursor: geoStatus === 'done' ? 'default' : 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
                  border: `1px solid ${geoStatus === 'done' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: geoStatus === 'done' ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-bg))' : 'var(--color-bg)',
                  color: geoStatus === 'done' ? 'var(--color-primary)' : 'var(--color-text)',
                }}
              >
                <Glyph name={geoStatus === 'done' ? 'check' : 'pin'} size={15} />
                {geoStatus === 'busy' ? t.maps.locationBusy : geoStatus === 'done' ? t.maps.locationSet : t.maps.locationUse}
              </button>
            </div>
            <p style={{ margin: '0 0 20px', fontSize: 11.5, lineHeight: 1.4, color: geoStatus === 'error' ? 'var(--color-overdue)' : 'var(--color-text-muted)' }}>
              {geoStatus === 'error' ? t.maps.locationError : t.maps.locationSkipHint}
            </p>
          </>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 10,
              background: 'var(--color-primary)', color: '#fff',
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
              border: 'none', cursor: 'pointer', opacity: (!name.trim() || creating) ? 0.5 : 1,
              transition: 'opacity 0.12s',
            }}
          >
            {creating ? '…' : t.maps.newMap.replace('+ ', '')}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '12px 18px', borderRadius: 10,
              background: 'transparent', color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-body)', fontSize: 15,
              border: '1px solid var(--color-border)', cursor: 'pointer',
            }}
          >
            {t.common.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}
