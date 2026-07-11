import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import { care, weeds } from '../api/client'
import type { RecentLogEntry, WeedSightingOut } from '../types'
import { resolveIconUrl } from '../utils/icons'
import { combineLogbookTimeline } from '../utils/fieldObservations'
import Glyph from '../components/ui/Glyph'

const LOG_TAG: Record<string, { color: string; bg: string; border: string }> = {
  water:       { color: 'var(--color-primary)',    bg: 'rgba(47,93,58,.08)',      border: 'rgba(47,93,58,.2)' },
  fertilize:   { color: 'var(--color-primary)',    bg: 'rgba(47,93,58,.08)',      border: 'rgba(47,93,58,.2)' },
  repot: { color: 'var(--color-text-soft)',  bg: 'rgba(74,90,71,.06)',      border: 'var(--color-border)' },
  prune:       { color: 'var(--color-text-soft)',  bg: 'rgba(74,90,71,.06)',      border: 'var(--color-border)' },
  mist:        { color: 'var(--color-primary)',    bg: 'rgba(47,93,58,.08)',      border: 'rgba(47,93,58,.2)' },
  rotate:      { color: 'var(--color-text-muted)', bg: 'rgba(138,148,130,.08)',  border: 'var(--color-border-soft)' },
  field:       { color: 'var(--color-primary)',    bg: 'rgba(47,93,58,.08)',      border: 'rgba(47,93,58,.2)' },
}

const PAGE_SIZE = 30

export default function LogboekPage() {
  const t = useT()
  const [careEntries, setCareEntries] = useState<RecentLogEntry[]>([])
  const [fieldObservations, setFieldObservations] = useState<WeedSightingOut[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)

  const fetchLog = useCallback(async (offset: number, replace: boolean) => {
    setLoading(true)
    try {
      const batch = await care.householdLog(PAGE_SIZE, offset)
      if (replace) {
        const observations = await weeds.listSightings().catch(() => [])
        setCareEntries(batch)
        setFieldObservations(observations)
      } else {
        setCareEntries(prev => [...prev, ...batch])
      }
      setHasMore(batch.length === PAGE_SIZE)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLog(0, true) }, [fetchLog])

  const entries = combineLogbookTimeline(careEntries, fieldObservations)

  return (
    <div className="card" style={{ borderRadius: 14, overflow: 'hidden', maxWidth: 720, margin: '24px auto' }}>
      {/* Header */}
      <div style={{ padding: '28px 18px 0', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--color-primary)', margin: 0 }}>{t.log.title}</h2>
        <Link to="/maps" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-text-muted)', textDecoration: 'none' }}>{t.common.back}</Link>
      </div>

      {/* Entries */}
      {entries.length === 0 && !loading ? (
        <div style={{ padding: '48px 18px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 15, color: 'var(--color-text-soft)', margin: 0 }}>{t.log.empty}</p>
        </div>
      ) : (
        entries.map((timelineEntry, i) => {
          const date = new Date(timelineEntry.occurred_at)
          const dateStr = date.toLocaleDateString(t.locale, { day: 'numeric', month: 'long' })
          const timeStr = date.toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' })

          if (timelineEntry.kind === 'field-observation') {
            const tag = LOG_TAG.field
            return (
              <div key={timelineEntry.id} className="log-entry" style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto', gap: 14, padding: '16px 18px', alignItems: 'flex-start', borderTop: i > 0 ? '1px solid var(--color-border-soft)' : 'none', overflow: 'hidden' }}>
                <Link to={timelineEntry.href} style={{ display: 'block', flexShrink: 0 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 8, background: 'linear-gradient(145deg, #FDFAF1, #EDE5D1)', border: '1px solid var(--color-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {timelineEntry.image_url ? <img src={timelineEntry.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: 'var(--color-text-muted)' }}><Glyph name="leaf" size={18} /></span>}
                  </div>
                </Link>
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-text-muted)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dateStr} · {timeStr}</div>
                  <Link to={timelineEntry.href} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, color: 'var(--color-text)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.log.fieldObservation} · <em style={{ color: 'var(--color-primary)' }}>{timelineEntry.title}</em>
                    </div>
                  </Link>
                  {(timelineEntry.notes || timelineEntry.subtitle) && <p style={{ margin: 0, fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 12, color: 'var(--color-text-soft)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{timelineEntry.notes ?? timelineEntry.subtitle}</p>}
                  <span className="log-mobile-tag" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: tag.color, background: tag.bg, padding: '2px 7px', borderRadius: 99, border: `1px solid ${tag.border}`, whiteSpace: 'nowrap', display: 'none' }}>{t.log.fieldObservation}</span>
                </div>
                <span className="log-desktop-tag" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: tag.color, background: tag.bg, padding: '3px 8px', borderRadius: 99, border: `1px solid ${tag.border}`, whiteSpace: 'nowrap', flexShrink: 0 }}>{t.log.fieldObservation}</span>
              </div>
            )
          }

          const entry = timelineEntry.care
          const tag = LOG_TAG[entry.care_type] ?? LOG_TAG.water
          const actionLabel = t.care[entry.care_type as keyof typeof t.care] ?? entry.care_type
          return (
            <div key={timelineEntry.id} className="log-entry" style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto', gap: 14, padding: '16px 18px', alignItems: 'flex-start', borderTop: i > 0 ? '1px solid var(--color-border-soft)' : 'none', overflow: 'hidden' }}>
              <Link to={`/plants/${entry.plant_id}`} style={{ display: 'block', flexShrink: 0 }}>
                <div style={{ width: 56, height: 56, borderRadius: 8, background: 'linear-gradient(145deg, #FDFAF1, #EDE5D1)', border: '1px solid var(--color-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {entry.icon_key ? <img src={resolveIconUrl(entry.icon_key)!} alt="" style={{ width: '80%', height: '80%', objectFit: 'contain' }} /> : <span style={{ color: 'var(--color-text-muted)' }}><Glyph name="leaf" size={18} /></span>}
                </div>
              </Link>
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-text-muted)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dateStr} · {timeStr}</div>
                <Link to={`/plants/${entry.plant_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, color: 'var(--color-text)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {actionLabel} · <em style={{ color: 'var(--color-primary)' }}>{entry.plant_name}</em>
                  </div>
                </Link>
                {entry.notes && <p style={{ margin: 0, fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 12, color: 'var(--color-text-soft)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{entry.notes}</p>}
                <span className="log-mobile-tag" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: tag.color, background: tag.bg, padding: '2px 7px', borderRadius: 99, border: `1px solid ${tag.border}`, whiteSpace: 'nowrap', display: 'none' }}>{actionLabel}</span>
              </div>
              <span className="log-desktop-tag" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: tag.color, background: tag.bg, padding: '3px 8px', borderRadius: 99, border: `1px solid ${tag.border}`, whiteSpace: 'nowrap', flexShrink: 0 }}>{actionLabel}</span>
            </div>
          )
        })
      )}

      {/* Load more */}
      {hasMore && careEntries.length > 0 && (
        <div style={{ borderTop: '1px solid var(--color-border-soft)', padding: '12px 18px', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={() => fetchLog(careEntries.length, false)}
            disabled={loading}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: loading ? 'var(--color-text-muted)' : 'var(--color-primary)', background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer', padding: 0 }}
          >
            {loading ? t.common.loading : t.log.loadMore + ' ↓'}
          </button>
        </div>
      )}

      {/* Loading at top */}
      {loading && entries.length === 0 && (
        <div style={{ padding: '32px 18px', textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', color: 'var(--color-text-muted)', fontSize: 13 }}>{t.common.loading}</span>
        </div>
      )}
    </div>
  )
}
