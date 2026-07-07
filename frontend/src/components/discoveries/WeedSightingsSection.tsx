import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../context/LanguageContext'
import { useFloreren } from '../../store/useFloreren'
import { weeds } from '../../api/client'
import type { WeedSightingOut } from '../../types'
import Glyph from '../ui/Glyph'
import { WeedSightingDetailSheet } from './WeedSightingDetailSheet'

const MONTH_NL = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${d.getDate()} ${MONTH_NL[d.getMonth()]} ${d.getFullYear()}`
}

export default function WeedSightingsSection() {
  const t = useT()
  const navigate = useNavigate()
  const maps = useFloreren((s) => s.maps)
  const [items, setItems] = useState<WeedSightingOut[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSighting, setSelectedSighting] = useState<WeedSightingOut | null>(null)

  function loadSightings() {
    setLoading(true)
    weeds.listSightings()
      .then((data) => {
        // Enrich with map names client-side
        const enriched = data.map((s) => {
          const map = maps.find((m) => m.id === s.map_id)
          return { ...s, map_name: map?.name ?? `Kaart #${s.map_id}` }
        })
        setItems(enriched)
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (maps.length > 0) {
      loadSightings()
    }
  }, [maps.length]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(sightingId: number) {
    if (!window.confirm(t.weeds.sightingsList.deleteConfirm)) return
    try {
      await weeds.deleteSighting(sightingId)
      setItems((prev) => prev.filter((s) => s.id !== sightingId))
      if (selectedSighting?.id === sightingId) {
        setSelectedSighting(null)
      }
    } catch {
      // silently fail
    }
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
          const mapName = sighting.map_name ?? `Kaart #${sighting.map_id}`
          return (
            <div
              key={sighting.id}
              onClick={() => setSelectedSighting(sighting)}
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
                  <span>{formatDate(sighting.sighted_at)}</span>
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
          onClose={() => setSelectedSighting(null)}
          onDelete={handleDelete}
          onNavigateToMap={() => {
            const slug = maps.find((m) => m.id === selectedSighting.map_id)?.slug
            if (slug) {
              setSelectedSighting(null)
              navigate(`/map/${slug}`)
            }
          }}
        />
      )}
    </>
  )
}
