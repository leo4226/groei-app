import { useState } from 'react'
import { useT } from '../../context/LanguageContext'
import type { WeedSightingOut } from '../../types'
import Glyph from '../ui/Glyph'

interface Props {
  sighting: WeedSightingOut
  onClose: () => void
  onDelete: (id: number) => void
  onNavigateToMap: () => void
}

const REMOVAL_DIFFICULTY_COLORS: Record<string, string> = {
  makkelijk: '#24e34c',
  gemiddeld: '#f59e0b',
  moeilijk: '#ef4444',
  easy: '#24e34c',
  medium: '#f59e0b',
  hard: '#ef4444',
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const months = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} om ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function WeedSightingDetailSheet({ sighting, onClose, onDelete, onNavigateToMap }: Props) {
  const t = useT()
  const [deleting, setDeleting] = useState(false)
  const s = t.weeds.sightingsList

  async function handleDelete() {
    if (!window.confirm(s.deleteConfirm)) return
    setDeleting(true)
    try {
      await onDelete(sighting.id)
    } catch {
      setDeleting(false)
    }
  }

  const difficultyColor = sighting.removal_difficulty
    ? (REMOVAL_DIFFICULTY_COLORS[sighting.removal_difficulty.toLowerCase()] ?? '#6b7280')
    : null

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 210,
        background: 'var(--color-surface)',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        borderTop: '2px solid var(--color-primary)',
        boxShadow: '0 -8px 30px rgba(0,0,0,0.15)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
        maxHeight: '80vh', overflowY: 'auto',
      }}>
        <button onClick={onClose} aria-label="Sluiten" style={{ display: 'block', margin: '12px auto 8px', padding: '8px 24px', background: 'none', border: 'none', cursor: 'pointer' }}>
          <div style={{ width: 40, height: 4, background: 'var(--color-border)', borderRadius: 999 }} />
        </button>

        <div style={{ padding: '0 20px 20px' }}>
          {sighting.photo_url ? (
            <img src={sighting.photo_url} alt={sighting.weed_name} style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 12, marginBottom: 16 }} />
          ) : (
            <div style={{ width: '100%', height: 120, borderRadius: 12, marginBottom: 16, background: 'var(--color-bg-warm)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 14 }}>
              <Glyph name="leaf" size={32} />&nbsp;{s.noPhoto}
            </div>
          )}

          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 22, margin: '0 0 2px', color: 'var(--color-text)' }}>{sighting.weed_name}</h2>
          {sighting.latin_name && (
            <p style={{ margin: '0 0 16px', fontSize: 13, fontStyle: 'italic', color: 'var(--color-text-soft)' }}>{sighting.latin_name}</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <Glyph name="calendar" size={16} style={{ color: 'var(--color-text-muted)' }} />
              <span style={{ color: 'var(--color-text-muted)', minWidth: 90 }}>{s.sightedOn}</span>
              <span style={{ color: 'var(--color-text)' }}>{formatDateTime(sighting.sighted_at)}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <Glyph name="map" size={16} style={{ color: 'var(--color-text-muted)' }} />
              <span style={{ color: 'var(--color-text-muted)', minWidth: 90 }}>{s.location}</span>
              <button onClick={onNavigateToMap} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-primary)', cursor: 'pointer', fontSize: 14, fontWeight: 500, textDecoration: 'underline' }}>
                {sighting.map_name ?? 'Kaart #' + sighting.map_id}
              </button>
            </div>

            {sighting.removal_difficulty && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                <Glyph name="alert" size={16} style={{ color: 'var(--color-text-muted)' }} />
                <span style={{ color: 'var(--color-text-muted)', minWidth: 90 }}>{s.removalDifficulty}</span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '2px 10px', borderRadius: 100,
                  background: difficultyColor ? `${difficultyColor}22` : 'var(--color-surface)',
                  color: difficultyColor ?? 'var(--color-text)', fontSize: 13, fontWeight: 500,
                }}>
                  {difficultyColor && <span style={{ width: 7, height: 7, borderRadius: '50%', background: difficultyColor, display: 'inline-block' }} />}
                  {sighting.removal_difficulty}
                </span>
              </div>
            )}

            {sighting.notes && (
              <div style={{ display: 'flex', gap: 10, fontSize: 14 }}>
                <Glyph name="book" size={16} style={{ color: 'var(--color-text-muted)', marginTop: 2 }} />
                <span style={{ color: 'var(--color-text-muted)', minWidth: 90, flexShrink: 0 }}>{s.notes}</span>
                <span style={{ color: 'var(--color-text)', whiteSpace: 'pre-wrap' }}>{sighting.notes}</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={handleDelete} disabled={deleting} style={{
              width: '100%', padding: '12px 20px', borderRadius: 12,
              border: '2px solid var(--color-overdue)',
              background: 'transparent', color: 'var(--color-overdue)',
              fontSize: 14, fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer',
              opacity: deleting ? 0.5 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <Glyph name="trash" size={16} />
              {deleting ? '...' : s.deleteSighting}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
