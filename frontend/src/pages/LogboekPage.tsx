import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import { care } from '../api/client'
import type { RecentLogEntry } from '../types'
import { resolveIconUrl } from '../utils/icons'

const LOG_TAG: Record<string, { color: string; bg: string; border: string }> = {
  water:       { color: 'var(--color-primary)',    bg: 'rgba(47,93,58,.08)',      border: 'rgba(47,93,58,.2)' },
  fertilize:   { color: 'var(--color-primary)',    bg: 'rgba(47,93,58,.08)',      border: 'rgba(47,93,58,.2)' },
  repot_check: { color: 'var(--color-text-soft)',  bg: 'rgba(74,90,71,.06)',      border: 'var(--color-border)' },
  prune:       { color: 'var(--color-text-soft)',  bg: 'rgba(74,90,71,.06)',      border: 'var(--color-border)' },
  mist:        { color: 'var(--color-primary)',    bg: 'rgba(47,93,58,.08)',      border: 'rgba(47,93,58,.2)' },
  rotate:      { color: 'var(--color-text-muted)', bg: 'rgba(138,148,130,.08)',  border: 'var(--color-border-soft)' },
}

const PAGE_SIZE = 30

export default function LogboekPage() {
  const t = useT()
  const [entries, setEntries] = useState<RecentLogEntry[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)

  const fetchLog = useCallback(async (offset: number, replace: boolean) => {
    setLoading(true)
    const batch = await care.householdLog(PAGE_SIZE, offset)
    if (replace) {
      setEntries(batch)
    } else {
      setEntries(prev => [...prev, ...batch])
    }
    setHasMore(batch.length === PAGE_SIZE)
    setLoading(false)
  }, [])

  useEffect(() => { fetchLog(0, true) }, [fetchLog])

  return (
    <div className="card" style={{ borderRadius: 14, overflow: 'hidden', maxWidth: 720, margin: '24px auto' }}>
      {/* Header */}
      <div style={{ padding: '28px 18px 0', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--color-primary)', margin: 0 }}>{t.log.title}</h2>
        <Link to="/dashboard" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-text-muted)', textDecoration: 'none' }}>{t.common.back}</Link>
      </div>

      {/* Entries */}
      {entries.length === 0 && !loading ? (
        <div style={{ padding: '48px 18px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 15, color: 'var(--color-text-soft)', margin: 0 }}>{t.log.empty}</p>
        </div>
      ) : (
        entries.map((entry, i) => {
          const tag = LOG_TAG[entry.care_type] ?? LOG_TAG.water
          const dateStr = new Date(entry.done_at).toLocaleDateString(t.locale, { day: 'numeric', month: 'long' })
          const timeStr = new Date(entry.done_at).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' })
          const actionLabel = t.care[entry.care_type as keyof typeof t.care] ?? entry.care_type
          return (
            <div key={entry.id} className="log-entry" style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto', gap: 14, padding: '16px 18px', alignItems: 'flex-start', borderTop: i > 0 ? '1px solid var(--color-border-soft)' : 'none', overflow: 'hidden' }}>
              <Link to={`/plants/${entry.plant_id}`} style={{ display: 'block', flexShrink: 0 }}>
                <div style={{ width: 56, height: 56, borderRadius: 8, background: 'linear-gradient(145deg, #FDFAF1, #EDE5D1)', border: '1px solid var(--color-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {entry.icon_key ? <img src={resolveIconUrl(entry.icon_key)!} alt="" style={{ width: '80%', height: '80%', objectFit: 'contain' }} /> : <span style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 11, color: 'var(--color-text-muted)' }}>🌿</span>}
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
      {hasMore && entries.length > 0 && (
        <div style={{ borderTop: '1px solid var(--color-border-soft)', padding: '12px 18px', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={() => fetchLog(entries.length, false)}
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