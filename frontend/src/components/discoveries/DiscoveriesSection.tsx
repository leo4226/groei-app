import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../context/LanguageContext'
import { discoveries as discoveriesApi, species as speciesApi, type PlantDiscovery } from '../../api/client'

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
        <div style={{ fontSize: 40, marginBottom: 12 }}>🌿</div>
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
    <div style={{ padding: '16px 0' }}>
      {items.map((item) => {
        const fitColor = bestFitColor(item.species_id != null ? fitMap[String(item.species_id)] : undefined)
        return (
          <div
            key={item.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 20px', borderBottom: '1px solid var(--color-border)',
            }}
          >
            {item.thumbnail_url ? (
              <img
                src={item.thumbnail_url}
                alt={item.common_name}
                style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
              />
            ) : (
              <div style={{
                width: 52, height: 52, borderRadius: 8, background: 'var(--color-surface)',
                flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24,
              }}>
                🌿
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 14, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.common_name}
              </p>
              {item.latin_name && (
                <p style={{ margin: '0 0 2px', fontSize: 12, fontStyle: 'italic', color: 'var(--color-text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.latin_name}
                </p>
              )}
              <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                {fitColor && (
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: fitColor, display: 'inline-block', flexShrink: 0 }} />
                )}
                {t.discovery.discovered}: {formatDate(item.discovered_at)}
              </p>
            </div>
            <button
              onClick={() => handleShare(item)}
              title={copiedId === item.id ? t.discovery.shareCopied : t.discovery.share}
              style={{
                padding: '6px 8px', borderRadius: 8, border: 'none',
                background: 'none', cursor: 'pointer',
                color: copiedId === item.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: 18, flexShrink: 0,
              }}
              aria-label={copiedId === item.id ? t.discovery.shareCopied : t.discovery.share}
            >
              {copiedId === item.id ? '✓' : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                  <polyline points="16 6 12 2 8 6"/>
                  <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
              )}
            </button>
            <button
              onClick={() => handleAddToGarden(item)}
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
              onClick={() => handleDelete(item.id)}
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
  )
}
