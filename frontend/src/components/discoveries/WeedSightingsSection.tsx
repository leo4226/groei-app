import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useT } from '../../context/LanguageContext'
import { useFloreren } from '../../store/useFloreren'
import { weeds } from '../../api/client'
import type { WeedSightingOut } from '../../types'
import Glyph from '../ui/Glyph'
import { WeedSightingDetailSheet } from './WeedSightingDetailSheet'

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function WeedSightingsSection() {
  const t = useT()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const maps = useFloreren((s) => s.maps)
  const [items, setItems] = useState<WeedSightingOut[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSighting, setSelectedSighting] = useState<WeedSightingOut | null>(null)

  const requestedSightingId = Number(searchParams.get('sighting') ?? 0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    weeds.listSightings()
      .then((data) => {
        if (cancelled) return
        const enriched = data.map((s) => {
          const map = maps.find((m) => m.id === s.map_id)
          return { ...s, map_name: map?.name ?? `${t.weeds.sightingsList.mapLabel} #${s.map_id}` }
        })
        setItems(enriched)
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [maps, t.weeds.sightingsList.mapLabel])

  useEffect(() => {
    if (!requestedSightingId || selectedSighting?.id === requestedSightingId) return
    const matched = items.find((item) => item.id === requestedSightingId)
    if (matched) setSelectedSighting(matched)
  }, [items, requestedSightingId, selectedSighting?.id])

  async function handleDelete(sightingId: number) {
    await weeds.deleteSighting(sightingId)
    setItems((prev) => prev.filter((s) => s.id !== sightingId))
    if (selectedSighting?.id === sightingId) {
      setSelectedSighting(null)
      setSearchParams({}, { replace: true })
    }
  }

  function openSighting(sighting: WeedSightingOut) {
    setSelectedSighting(sighting)
    setSearchParams({ sighting: String(sighting.id) }, { replace: true })
  }

  function closeSighting() {
    setSelectedSighting(null)
    if (searchParams.has('sighting')) setSearchParams({}, { replace: true })
  }

  if (loading) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--color-text-soft)' }}>
        {t.weeds.sightingsList.loading}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ marginBottom: 12, color: 'var(--color-text-muted)' }}>
          <Glyph name="leaf" size={40} />
        </div>
        <p style={{ margin: '0 0 4px', fontWeight: 600, color: 'var(--color-text)' }}>
          {t.weeds.sightingsList.empty}
        </p>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-soft)' }}>
          {t.weeds.sightingsList.emptyHint}
        </p>
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: '8px 0' }}>
        {items.map((sighting) => {
          const mapName = sighting.map_name ?? `${t.weeds.sightingsList.mapLabel} #${sighting.map_id}`
          return (
            <div
              key={sighting.id}
              onClick={() => openSighting(sighting)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 20px', borderBottom: '1px solid var(--color-border)',
                cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-warm)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              {sighting.photo_url ? (
                <img
                  src={sighting.photo_url}
                  alt={sighting.weed_name}
                  style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <div style={{
                  width: 52, height: 52, borderRadius: 8, background: 'var(--color-surface)',
                  flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-text-muted)',
                }}>
                  <Glyph name="leaf" size={24} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 14, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {sighting.weed_name}
                </p>
                {sighting.latin_name && (
                  <p style={{ margin: '0 0 2px', fontSize: 12, fontStyle: 'italic', color: 'var(--color-text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sighting.latin_name}
                  </p>
                )}
                <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span>{t.weeds.sightingsList.mapLabel}: {mapName}</span>
                  <span>·</span>
                  <span>{formatDate(sighting.sighted_at, t.locale)}</span>
                </p>
              </div>
              <div style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
                <Glyph name="chevron-right" size={16} />
              </div>
            </div>
          )
        })}
      </div>

      {selectedSighting && (
        <WeedSightingDetailSheet
          sighting={selectedSighting}
          onClose={closeSighting}
          onDelete={handleDelete}
          onNavigateToMap={() => {
            const slug = maps.find((m) => m.id === selectedSighting.map_id)?.slug
            if (slug) {
              closeSighting()
              navigate(`/map/${slug}`)
            }
          }}
        />
      )}
    </>
  )
}
