import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useGroeiStore } from '../store/useGroeiStore'
import { PLANT_ICONS } from '../constants/plantIcons'
import { CATEGORY_LABELS, PLANT_TYPE_LABELS, FORM_LABELS } from '../constants/plantLabels'
import type { Plant, PlantIcon } from '../types'
import { fetchAlertSummary, fetchIconCatalog } from '../api/client'

const OUTDOOR_KEYWORDS = ['tuin', 'balkon', 'terras', 'buiten', 'kas']
const isTuin = (plant: Plant) =>
  OUTDOOR_KEYWORDS.some(k => plant.location_name?.toLowerCase().includes(k))

const TYPE_BG: Record<string, string> = {
  tree:       '#160572',
  shrub:      '#2544a0',
  grass:      '#24e34c',
  herb:       '#24e3dc',
  flower:     '#d98199',
  bulb:       '#d64e2e',
  succulent:  '#e29675',
  fern:       '#4b0f4d',
  edible:     '#ff7701',
  houseplant: '#160572',
  cactus:     '#f9e44d',
  climber:    '#2544a0',
  unknown:    '#909090',
}

export default function Plants() {
  const { plants, isLoading } = useGroeiStore()
  const [filterArea, setFilterArea] = useState<'all' | 'tuin' | 'huis'>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterForm, setFilterForm] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const alertsOnly = searchParams.get('alerts') === '1'
  const [alertPlantIds, setAlertPlantIds] = useState<number[] | null>(null)
  const [iconCatalog, setIconCatalog] = useState<PlantIcon[]>([])

  useEffect(() => {
    fetchIconCatalog().then(setIconCatalog).catch(() => {})
  }, [])

  useEffect(() => {
    if (alertsOnly) {
      fetchAlertSummary()
        .then(s => setAlertPlantIds(s.plant_ids_with_alerts))
        .catch(() => setAlertPlantIds([]))
    } else {
      setAlertPlantIds(null)
    }
  }, [alertsOnly])

  // Build icon_key -> PlantIcon lookup for form + family data
  const iconMap = useMemo(() => {
    const m = new Map<string, PlantIcon>()
    iconCatalog.forEach(icon => m.set(icon.id, icon))
    return m
  }, [iconCatalog])

  const tuinCount = plants.filter(isTuin).length
  const huisCount = plants.filter(p => !isTuin(p)).length

  // Compute available plant types from current plants
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    plants.forEach(p => {
      const t = p.plant_type || 'unknown'
      counts[t] = (counts[t] || 0) + 1
    })
    counts.all = plants.length
    return counts
  }, [plants])

  // Compute form counts from icon catalog
  const formCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    plants.forEach(p => {
      if (!p.icon_key) return
      const icon = iconMap.get(p.icon_key)
      const form = icon?.form || 'other'
      counts[form] = (counts[form] || 0) + 1
    })
    counts.all = plants.length
    return counts
  }, [plants, iconMap])

  // Build filtered list
  const filtered = plants.filter((p) => {
    if (alertsOnly && alertPlantIds !== null && !alertPlantIds.includes(p.id)) return false
    if (filterArea === 'tuin' && !isTuin(p)) return false
    if (filterArea === 'huis' && isTuin(p)) return false
    if (filterType !== 'all' && (p.plant_type || 'unknown') !== filterType) return false
    if (filterForm !== 'all') {
      const icon = p.icon_key ? iconMap.get(p.icon_key) : null
      const form = icon?.form || 'other'
      if (form !== filterForm) return false
    }
    if (query) {
      const q = query.toLowerCase()
      return (
        p.name.toLowerCase().includes(q) ||
        (p.species?.toLowerCase().includes(q) ?? false)
      )
    }
    return true
  })

  const categoryCount = new Set(plants.map(p => p.plant_type).filter(Boolean)).size

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <header className="plants-header" style={{
        padding: '40px 24px 20px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        gap: 20,
      }}>
        <div>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
            margin: '0 0 8px 0',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <span style={{ width: 24, height: 1, background: 'var(--color-border)', flex: 'none' }} />
            Mijn Tuin · Est. 2026
            <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
          </p>
          <h1 style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 500,
            fontSize: 'clamp(36px, 5vw, 56px)',
            lineHeight: 0.95,
            letterSpacing: '-0.02em',
            color: 'var(--color-text)',
            margin: 0,
          }}>
            Planten <em style={{ fontStyle: 'italic', color: 'var(--color-primary)', fontWeight: 400 }}>Icons</em>.
          </h1>
          <p style={{
            fontFamily: 'var(--font-heading)',
            fontStyle: 'italic',
            fontSize: 15,
            lineHeight: 1.5,
            color: 'var(--color-text-soft)',
            maxWidth: 440,
            margin: '8px 0 0 0',
          }}>
            Een botanische gids voor je plantencollectie — binnen en buiten.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 28 }}>
          <div style={{ textAlign: 'right' }}>
            <span style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 34,
              fontWeight: 500,
              lineHeight: 1,
              color: 'var(--color-primary)',
              display: 'block',
            }}>{plants.length}</span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              color: 'var(--color-text-muted)',
              marginTop: 4,
            }}>Planten</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 34,
              fontWeight: 500,
              lineHeight: 1,
              color: 'var(--color-primary)',
              display: 'block',
            }}>{categoryCount}</span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              color: 'var(--color-text-muted)',
              marginTop: 4,
            }}>Categorieen</span>
          </div>
        </div>
      </header>

      {/* Search bar */}
      <div style={{ padding: '20px 24px 0', display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <svg
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
          </svg>
          <input
            id="plant-search"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Zoek op naam of soort…"
            style={{
              width: '100%',
              padding: '13px 50px 13px 42px',
              borderRadius: 100,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              fontSize: 15,
              fontFamily: 'var(--font-heading)',
              boxShadow: '0 1px 2px rgba(31,42,30,0.04)',
              boxSizing: 'border-box',
              outline: 'none',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(47,93,58,0.12), 0 1px 2px rgba(31,42,30,0.04)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(31,42,30,0.04)'; }}
          />
          <span style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--color-text-muted)',
            background: 'var(--color-bg-warm)',
            padding: '3px 7px',
            borderRadius: 5,
            border: '1px solid var(--color-border)',
            pointerEvents: 'none',
          }}>
            {typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac') ? '⌘K' : 'Ctrl K'}
          </span>
        </div>
        <Link
          to="/plants/add"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--color-primary)',
            textDecoration: 'none',
            padding: '10px 16px',
            border: '1px solid var(--color-primary)',
            borderRadius: 100,
            whiteSpace: 'nowrap',
            transition: 'all 0.15s',
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-surface)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-primary)'; }}
        >
          + Toevoegen
        </Link>
      </div>

      <div className="px-4">
        {/* Alert filter banner */}
        {alertsOnly && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', marginBottom: 12, background: '#fffac2', borderRadius: 10, border: '1px solid #ff7701' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#2c2c2c' }}>
              ⚠️ Planten met weeralerts
            </p>
            <button
              onClick={() => navigate('/plants')}
              style={{ fontSize: 12, color: '#2c2c2c', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
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
        background: 'linear-gradient(145deg, #fef9ee 0%, #f2ebe6 100%)',
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
