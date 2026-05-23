import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFloreren } from '../../store/useFloreren'
import { useT } from '../../context/LanguageContext'

interface Props {
  open: boolean
  onClose: () => void
}

export default function NewMapModal({ open, onClose }: Props) {
  const t = useT()
  const navigate = useNavigate()
  const createMap = useFloreren(s => s.createMap)

  const [name, setName] = useState('')
  const [mapType, setMapType] = useState<'outdoor' | 'indoor'>('outdoor')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleCreate() {
    if (!name.trim() || creating) return
    setCreating(true)
    setError(null)
    try {
      const map = await createMap({ name: name.trim(), map_type: mapType })
      setName('')
      setMapType('outdoor')
      onClose()
      navigate(`/maps/${map.id}/edit-layout`)
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
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
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
