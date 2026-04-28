import { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useGroeiStore } from '../store/useGroeiStore'
import { PLANT_ICONS } from '../constants/plantIcons'
import type { Plant } from '../types'
import { fetchAlertSummary } from '../api/client'

const OUTDOOR_KEYWORDS = ['tuin', 'balkon', 'terras', 'buiten', 'kas']
const isTuin = (plant: Plant) =>
  OUTDOOR_KEYWORDS.some(k => plant.location_name?.toLowerCase().includes(k))

const TYPE_BG: Record<string, string> = {
  tree:       '#2D6A4F',
  shrub:      '#3A7A5C',
  grass:      '#4E8B68',
  herb:       '#5A9A75',
  flower:     '#B7654B',
  bulb:       '#9A5540',
  succulent:  '#6DAA8A',
  fern:       '#3B6B55',
  edible:     '#7A5B2A',
  houseplant: '#2D6A4F',
  cactus:     '#7A8A3A',
  climber:    '#3D6B4F',
  unknown:    '#6B7C66',
}

export default function Plants() {
  const { plants, isLoading } = useGroeiStore()
  const [filterArea, setFilterArea] = useState<'all' | 'tuin' | 'huis'>('all')
  const [query, setQuery] = useState('')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const alertsOnly = searchParams.get('alerts') === '1'
  const [alertPlantIds, setAlertPlantIds] = useState<number[] | null>(null)

  useEffect(() => {
    if (alertsOnly) {
      fetchAlertSummary()
        .then(s => setAlertPlantIds(s.plant_ids_with_alerts))
        .catch(() => setAlertPlantIds([]))
    } else {
      setAlertPlantIds(null)
    }
  }, [alertsOnly])

  const tuinCount = plants.filter(isTuin).length
  const huisCount = plants.filter(p => !isTuin(p)).length

  const filtered = plants.filter((p) => {
    if (alertsOnly && alertPlantIds !== null && !alertPlantIds.includes(p.id)) return false
    if (filterArea === 'tuin' && !isTuin(p)) return false
    if (filterArea === 'huis' && isTuin(p)) return false
    if (query) {
      const q = query.toLowerCase()
      return (
        p.name.toLowerCase().includes(q) ||
        (p.species?.toLowerCase().includes(q) ?? false)
      )
    }
    return true
  })

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 flex justify-between items-end">
        <div>
          <p style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-text-muted)', margin: '0 0 4px 0', fontFamily: 'monospace' }}>
            Mijn Tuin
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, color: 'var(--color-text)', margin: 0 }}>
            Planten
          </h1>
        </div>
        <Link
          to="/plants/add"
          className="no-underline"
          style={{
            background: 'var(--color-primary)',
            color: '#fff',
            padding: '9px 18px',
            borderRadius: 100,
            fontWeight: 600,
            fontSize: 13,
            boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
          }}
        >
          + Toevoegen
        </Link>
      </div>

      {/* Search bar */}
      <div className="px-4 mb-3">
        <div style={{ position: 'relative' }}>
          <svg
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Zoek op naam of soort…"
            style={{
              width: '100%',
              paddingLeft: 40,
              paddingRight: 16,
              paddingTop: 12,
              paddingBottom: 12,
              borderRadius: 100,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              fontSize: 14,
              fontFamily: 'var(--font-body)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Area filter chips */}
      <div className="flex gap-2 px-4 pb-3">
        <FilterChip active={filterArea === 'all'} onClick={() => setFilterArea('all')}>
          Alle <Count>{plants.length}</Count>
        </FilterChip>
        <FilterChip active={filterArea === 'tuin'} onClick={() => setFilterArea('tuin')}>
          🌿 Tuin <Count>{tuinCount}</Count>
        </FilterChip>
        <FilterChip active={filterArea === 'huis'} onClick={() => setFilterArea('huis')}>
          🏠 Huis <Count>{huisCount}</Count>
        </FilterChip>
      </div>

      <div className="px-4">
        {/* Alert filter banner */}
        {alertsOnly && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', marginBottom: 12, background: '#FFF3CD', borderRadius: 10, border: '1px solid #F0C040' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#856404' }}>
              ⚠️ Planten met weeralerts
            </p>
            <button
              onClick={() => navigate('/plants')}
              style={{ fontSize: 12, color: '#856404', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
            >
              Alles tonen
            </button>
          </div>
        )}

        {/* Results bar */}
        {!isLoading && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0 16px', borderBottom: '1px solid var(--color-border)', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 13, fontStyle: 'italic', color: 'var(--color-text-muted)' }}>
              {query ? (
                <>Gevonden: <strong style={{ fontStyle: 'normal', color: 'var(--color-text)' }}>{filtered.length}</strong></>
              ) : (
                <>Toon <strong style={{ color: 'var(--color-text)' }}>{filtered.length}</strong> planten</>
              )}
            </p>
            {query && (
              <button
                onClick={() => setQuery('')}
                style={{ fontSize: 12, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Wis zoekopdracht ✕
              </button>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card overflow-hidden" style={{ borderRadius: 16 }}>
                <div className="skeleton" style={{ aspectRatio: '1', borderRadius: 0 }} />
                <div className="p-3 space-y-2">
                  <div className="skeleton h-4 w-24" />
                  <div className="skeleton h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🌱</div>
            <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-text)', margin: '0 0 6px' }}>
              {query ? 'Niets gevonden' : 'Nog geen planten'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
              {query ? 'Probeer een andere zoekopdracht' : 'Voeg je eerste plant toe via + Toevoegen'}
            </p>
          </div>
        )}

        {/* Plant grid */}
        {!isLoading && filtered.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {filtered.map((plant) => (
              <PlantCard key={plant.id} plant={plant} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="whitespace-nowrap"
      style={{
        padding: '7px 14px',
        borderRadius: 100,
        fontSize: 13,
        fontWeight: 500,
        border: active ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
        background: active ? 'var(--color-primary)' : 'transparent',
        color: active ? '#fff' : 'var(--color-text-muted)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

function Count({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ marginLeft: 4, opacity: 0.65, fontVariantNumeric: 'tabular-nums' }}>
      {children}
    </span>
  )
}

function getStatusColor(plant: Plant): string | null {
  if (plant.care_schedules.length === 0) return null
  const today = new Date().toISOString().slice(0, 10)
  for (const sched of plant.care_schedules) {
    if (sched.next_due < today) return 'var(--color-overdue)'
    if (sched.next_due === today) return 'var(--color-due)'
  }
  return 'var(--color-good)'
}

function PlantIconWell({ plant }: { plant: Plant }) {
  if (plant.icon_key) {
    return (
      <div style={{
        aspectRatio: '1',
        background: 'linear-gradient(145deg, #FDFAF1 0%, #EDE5D1 100%)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16%',
      }}>
        <img
          src={`/api/icons/${plant.icon_key}.svg`}
          alt={plant.name}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
    )
  }

  const type = plant.plant_type || 'unknown'
  const bg = TYPE_BG[type] || TYPE_BG.unknown
  const iconBody = PLANT_ICONS[type] || PLANT_ICONS['unknown']

  return (
    <div style={{
      aspectRatio: '1',
      background: `linear-gradient(145deg, ${bg}cc, ${bg})`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20%',
    }}>
      <svg
        viewBox="0 0 100 100"
        style={{ width: '100%', height: '100%' }}
        dangerouslySetInnerHTML={{ __html: iconBody }}
      />
    </div>
  )
}

function PlantCard({ plant }: { plant: Plant }) {
  const statusColor = getStatusColor(plant)
  const rawType = plant.plant_type || plant.icon_key?.split('_')[0] || null
  const typeLabel = rawType ? rawType.charAt(0).toUpperCase() + rawType.slice(1) : null

  return (
    <Link
      to={`/plants/${plant.id}`}
      className="card no-underline block"
      style={{ borderRadius: 16, overflow: 'hidden' }}
    >
      <div style={{ position: 'relative' }}>
        <PlantIconWell plant={plant} />

        {typeLabel && (
          <span style={{
            position: 'absolute',
            top: 8,
            left: 8,
            fontSize: 9,
            fontFamily: 'monospace',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--color-text-muted)',
            background: 'rgba(253,250,241,0.92)',
            padding: '2px 7px',
            borderRadius: 5,
            border: '1px solid rgba(232,224,214,0.7)',
          }}>
            {typeLabel}
          </span>
        )}

        {statusColor && (
          <span style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: statusColor,
            border: '1.5px solid rgba(255,255,255,0.9)',
            display: 'block',
          }} />
        )}
      </div>

      <div style={{ padding: '10px 12px 12px' }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' }}>
          {plant.name}
        </p>
        {plant.species && (
          <p style={{ margin: '2px 0 0', fontSize: 11, fontStyle: 'italic', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {plant.species}
          </p>
        )}
        {plant.location_name && (
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {plant.location_icon} {plant.location_name}
          </p>
        )}
      </div>
    </Link>
  )
}
