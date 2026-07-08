import { useState, useEffect, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../context/LanguageContext'
import { discoveries as discoveriesApi, species as speciesApi, type PlantDiscovery } from '../../api/client'
import { buildDiscoveryJournalEntry } from '../../utils/discoveryJournal'
import Glyph from '../ui/Glyph'

const MONTH_NL = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']

const FIT_RANK: Record<string, number> = { perfect: 4, acceptable: 3, marginal: 2, tolerated: 1 }
const FIT_COLOR: Record<string, string> = { perfect: '#24e34c', acceptable: '#a3e635', marginal: '#f59e0b', tolerated: '#6b7280' }

type FitVerdicts = Array<{ sun_fit: string | null }>

function bestFitColor(verdicts: FitVerdicts | undefined): string | null {
  if (!verdicts?.length) return null
  const best = verdicts.reduce((b, v) =>
    (FIT_RANK[v.sun_fit ?? ''] ?? 0) > (FIT_RANK[b.sun_fit ?? ''] ?? 0) ? v : b,
    verdicts[0]
  )
  return best.sun_fit ? (FIT_COLOR[best.sun_fit] ?? null) : null
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${d.getDate()} ${MONTH_NL[d.getMonth()]} ${d.getFullYear()}`
}

export default function DiscoveriesSection() {
  const t = useT()
  const navigate = useNavigate()
  const [items, setItems] = useState<PlantDiscovery[]>([])
  const [loading, setLoading] = useState(true)
  const [fitMap, setFitMap] = useState<Record<string, FitVerdicts>>({})
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [selected, setSelected] = useState<PlantDiscovery | null>(null)

  useEffect(() => {
    discoveriesApi.list()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const ids = [...new Set(items.flatMap(i => i.species_id != null ? [i.species_id] : []))]
    if (ids.length === 0) return
    speciesApi.gardenFitBatch(ids).then(setFitMap).catch(() => {})
  }, [items])

  async function handleDelete(id: number) {
    if (!window.confirm(t.discovery.journalDeleteConfirm)) return
    await discoveriesApi.delete(id).catch(() => {})
    setItems((prev) => prev.filter((d) => d.id !== id))
    setSelected((prev) => prev?.id === id ? null : prev)
  }

  async function handleShare(item: PlantDiscovery) {
    const text = `${item.common_name}${item.latin_name ? ` (${item.latin_name})` : ''} 🌿 — floreren.app`
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: item.common_name, text }).catch(() => {})
    } else {
      try {
        await navigator.clipboard.writeText(text)
        setCopiedId(item.id)
        setTimeout(() => setCopiedId(null), 2000)
      } catch {
        // clipboard unavailable — fail silently
      }
    }
  }

  function handleAddToGarden(item: PlantDiscovery) {
    navigate('/plants/add', {
      state: {
        prefill: {
          name: item.common_name,
          scientific_name: item.latin_name ?? undefined,
          species_id: item.species_id ?? undefined,
        },
        from: 'journal',
      },
    })
  }

  function stopAction(e: MouseEvent, action: () => void) {
    e.stopPropagation()
    action()
  }

  if (loading) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--color-text-soft)' }}>
        ...
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
          {t.discovery.journalEmpty}
        </p>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-soft)' }}>
          {t.discovery.journalEmptyHint}
        </p>
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: '16px 0' }}>
        {items.map((item) => {
          const entry = buildDiscoveryJournalEntry(item)
          const fitColor = bestFitColor(item.species_id != null ? fitMap[String(item.species_id)] : undefined)
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelected(item)
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 20px', borderBottom: '1px solid var(--color-border)',
                cursor: 'pointer',
              }}
            >
              {entry.image_url ? (
                <img
                  src={entry.image_url}
                  alt={entry.title}
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
                  {entry.title}
                </p>
                {entry.subtitle && (
                  <p style={{ margin: '0 0 2px', fontSize: 12, fontStyle: 'italic', color: 'var(--color-text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {entry.subtitle}
                  </p>
                )}
                <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {fitColor && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: fitColor, display: 'inline-block', flexShrink: 0 }} />
                  )}
                  {t.discovery.discovered}: {formatDate(entry.occurred_at)}
                </p>
              </div>
              <button
                onClick={(e) => stopAction(e, () => void handleShare(item))}
                title={copiedId === item.id ? t.discovery.shareCopied : t.discovery.share}
                style={{
                  padding: '6px 8px', borderRadius: 8, border: 'none',
                  background: 'none', cursor: 'pointer',
                  color: copiedId === item.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  fontSize: 18, flexShrink: 0,
                }}
                aria-label={copiedId === item.id ? t.discovery.shareCopied : t.discovery.share}
              >
                {copiedId === item.id ? <Glyph name="check" size={16} /> : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                    <polyline points="16 6 12 2 8 6"/>
                    <line x1="12" y1="2" x2="12" y2="15"/>
                  </svg>
                )}
              </button>
              <button
                onClick={(e) => stopAction(e, () => handleAddToGarden(item))}
                title={t.discovery.addToGarden}
                style={{
                  padding: '6px 8px', borderRadius: 8, border: 'none',
                  background: 'none', cursor: 'pointer', color: 'var(--color-primary)',
                  fontSize: 18, flexShrink: 0,
                }}
                aria-label={t.discovery.addToGarden}
              >
                +
              </button>
              <button
                onClick={(e) => stopAction(e, () => void handleDelete(item.id))}
                style={{
                  padding: '6px 8px', borderRadius: 8, border: 'none',
                  background: 'none', cursor: 'pointer', color: 'var(--color-text-muted)',
                  fontSize: 18, flexShrink: 0,
                }}
                aria-label="Verwijder"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selected.common_name}
          onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(20,20,16,.35)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 520, maxHeight: '86vh', overflowY: 'auto', background: 'var(--color-bg)', borderRadius: '24px 24px 0 0', padding: 20, boxShadow: '0 -16px 40px rgba(0,0,0,.18)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-primary)' }}>{t.weeds.sightingsList.title}</span>
              <button onClick={() => setSelected(null)} style={{ border: 'none', background: 'none', color: 'var(--color-text-muted)', fontSize: 24, cursor: 'pointer' }} aria-label="Sluiten">×</button>
            </div>
            {selected.thumbnail_url && (
              <img src={selected.thumbnail_url} alt={selected.common_name} style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 16, marginBottom: 16 }} />
            )}
            <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 500, color: 'var(--color-text)' }}>{selected.common_name}</h2>
            {selected.latin_name && <p style={{ margin: '0 0 14px', fontStyle: 'italic', color: 'var(--color-text-soft)' }}>{selected.latin_name}</p>}
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--color-text-muted)' }}>{t.discovery.discovered}: {formatDate(selected.discovered_at)}</p>
            {selected.notes && <p style={{ margin: '0 0 18px', lineHeight: 1.5, color: 'var(--color-text)' }}>{selected.notes}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => handleAddToGarden(selected)} style={{ flex: 1, padding: '12px 14px', borderRadius: 12, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 600 }}>{t.discovery.addToGarden}</button>
              <button onClick={() => void handleShare(selected)} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}>{t.discovery.share}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
