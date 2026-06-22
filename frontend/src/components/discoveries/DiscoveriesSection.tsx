import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../context/LanguageContext'
import { discoveries as discoveriesApi, type PlantDiscovery } from '../../api/client'

const MONTH_NL = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']

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

  useEffect(() => {
    discoveriesApi.list()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete(id: number) {
    if (!window.confirm(t.discovery.journalDeleteConfirm)) return
    await discoveriesApi.delete(id).catch(() => {})
    setItems((prev) => prev.filter((d) => d.id !== id))
  }

  function handleAddToGarden(item: PlantDiscovery) {
    navigate('/plants/add', {
      state: {
        prefill: {
          name: item.common_name,
          scientific_name: item.latin_name ?? undefined,
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
      {items.map((item) => (
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
            <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)' }}>
              {t.discovery.discovered}: {formatDate(item.discovered_at)}
            </p>
          </div>
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
      ))}
    </div>
  )
}
