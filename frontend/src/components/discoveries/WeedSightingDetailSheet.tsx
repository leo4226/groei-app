import { useEffect, useState } from 'react'
import { useT } from '../../context/LanguageContext'
import { weeds } from '../../api/client'
import type { SightingDetailOut, WeedSightingOut } from '../../types'
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

function formatDateTime(iso: string, locale: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function valueText(value: unknown): string | null {
  if (value == null || value === '') return null
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(', ')
  if (typeof value === 'boolean') return value ? '✓' : '—'
  if (typeof value === 'object') return null
  return String(value)
}

function DetailInfo({ label, value }: { label: string; value: unknown }) {
  const text = valueText(value)
  if (!text) return null
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 14 }}>
      <span style={{ color: 'var(--color-text-muted)', minWidth: 92, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--color-text)', lineHeight: 1.45 }}>{text}</span>
    </div>
  )
}

export function WeedSightingDetailSheet({ sighting, onClose, onDelete, onNavigateToMap }: Props) {
  const t = useT()
  const [deleting, setDeleting] = useState(false)
  const [detail, setDetail] = useState<SightingDetailOut | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(true)
  const s = t.weeds.sightingsList

  useEffect(() => {
    let cancelled = false
    setLoadingDetail(true)
    setDetail(null)
    weeds.getSighting(sighting.id)
      .then((data) => {
        if (!cancelled) setDetail(data)
      })
      .catch(() => {
        if (!cancelled) setDetail(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false)
      })
    return () => { cancelled = true }
  }, [sighting.id])

  async function handleDelete() {
    if (!window.confirm(s.deleteConfirm)) return
    setDeleting(true)
    try {
      await onDelete(sighting.id)
    } catch {
      setDeleting(false)
    }
  }

  const display = detail ?? sighting
  const difficultyColor = display.removal_difficulty
    ? (REMOVAL_DIFFICULTY_COLORS[display.removal_difficulty.toLowerCase()] ?? '#6b7280')
    : null

  const ecology = asRecord(detail?.ecology_data)
  const habitat = asRecord(ecology?.habitat)
  const appearance = asRecord(ecology?.appearance)
  const removal = asRecord(detail?.removal_json)

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
        <button onClick={onClose} aria-label="Close" style={{ display: 'block', margin: '12px auto 8px', padding: '8px 24px', background: 'none', border: 'none', cursor: 'pointer' }}>
          <div style={{ width: 40, height: 4, background: 'var(--color-border)', borderRadius: 999 }} />
        </button>

        <div style={{ padding: '0 20px 20px' }}>
          {display.photo_url ? (
            <img src={display.photo_url} alt={display.weed_name} style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 12, marginBottom: 16 }} />
          ) : (
            <div style={{ width: '100%', height: 120, borderRadius: 12, marginBottom: 16, background: 'var(--color-bg-warm)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 14 }}>
              <Glyph name="leaf" size={32} />&nbsp;{s.noPhoto}
            </div>
          )}

          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 22, margin: '0 0 2px', color: 'var(--color-text)' }}>{display.weed_name}</h2>
          {display.latin_name && (
            <p style={{ margin: '0 0 16px', fontSize: 13, fontStyle: 'italic', color: 'var(--color-text-soft)' }}>{display.latin_name}</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <Glyph name="calendar" size={16} style={{ color: 'var(--color-text-muted)' }} />
              <span style={{ color: 'var(--color-text-muted)', minWidth: 90 }}>{s.sightedOn}</span>
              <span style={{ color: 'var(--color-text)' }}>{formatDateTime(display.sighted_at, t.locale)}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <Glyph name="map" size={16} style={{ color: 'var(--color-text-muted)' }} />
              <span style={{ color: 'var(--color-text-muted)', minWidth: 90 }}>{s.location}</span>
              <button onClick={onNavigateToMap} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-primary)', cursor: 'pointer', fontSize: 14, fontWeight: 500, textDecoration: 'underline' }}>
                {display.map_name ?? `Map #${display.map_id}`}
              </button>
            </div>

            {display.removal_difficulty && (
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
                  {display.removal_difficulty}
                </span>
              </div>
            )}

            {display.notes && (
              <div style={{ display: 'flex', gap: 10, fontSize: 14 }}>
                <Glyph name="book" size={16} style={{ color: 'var(--color-text-muted)', marginTop: 2 }} />
                <span style={{ color: 'var(--color-text-muted)', minWidth: 90, flexShrink: 0 }}>{s.notes}</span>
                <span style={{ color: 'var(--color-text)', whiteSpace: 'pre-wrap' }}>{display.notes}</span>
              </div>
            )}
          </div>

          {(loadingDetail || detail) && (
            <section style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16, marginBottom: 20 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{s.fieldGuide}</h3>
              {loadingDetail && <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>{s.loadingDetail}</p>}
              {!loadingDetail && detail && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <DetailInfo label={s.funFact} value={detail.fun_fact_nl ?? detail.fun_fact_en} />
                  <DetailInfo label={s.habitat} value={habitat?.places} />
                  <DetailInfo label={s.appearance} value={appearance?.distinguishing ?? appearance?.growth_form ?? appearance?.flower_color} />
                  <DetailInfo label={s.flowering} value={detail.flowering_months?.length ? detail.flowering_months.join(', ') : null} />
                  <DetailInfo label={s.native} value={ecology?.native_to_nl} />
                  <DetailInfo label={s.edible} value={ecology?.edible} />
                  <DetailInfo label={s.removalTip} value={removal?.removal_tip ?? removal?.removalMethod ?? removal?.removal_method} />
                </div>
              )}
            </section>
          )}

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
