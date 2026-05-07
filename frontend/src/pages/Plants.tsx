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

  // Keyboard shortcut: Ctrl/Cmd+K focuses search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        const input = document.querySelector<HTMLInputElement>('#plant-search')
        input?.focus()
        input?.select()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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

      {/* Filter row 1: Locatie */}
      <div style={{ padding: '14px 24px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          color: 'var(--color-text-muted)',
          flexShrink: 0,
          minWidth: 48,
        }}>Locatie</span>
        <FilterChip label="Alle" count={plants.length} active={filterArea === 'all'} onClick={() => setFilterArea('all')} />
        <FilterChip label="🏠 Huis" count={huisCount} active={filterArea === 'huis'} onClick={() => setFilterArea('huis')} />
        <FilterChip label="🌿 Tuin" count={tuinCount} active={filterArea === 'tuin'} onClick={() => setFilterArea('tuin')} />
      </div>

      {/* Filter row 2: Plant type */}
      <div style={{ padding: '6px 24px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          color: 'var(--color-text-muted)',
          flexShrink: 0,
          minWidth: 48,
        }}>Type</span>
        <FilterChip label="Alle" count={typeCounts.all} active={filterType === 'all'} onClick={() => setFilterType('all')} />
        {Object.entries(PLANT_TYPE_LABELS).map(([key, label]) => {
          const count = typeCounts[key] || 0
          if (count === 0) return null
          return (
            <FilterChip
              key={key}
              label={label}
              count={count}
              active={filterType === key}
              onClick={() => setFilterType(filterType === key ? 'all' : key)}
            />
          )
        })}
      </div>

      {/* Filter row 3: Form */}
      <div style={{ padding: '6px 24px 8px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          color: 'var(--color-text-muted)',
          flexShrink: 0,
          minWidth: 48,
        }}>Vorm</span>
        {Object.entries(FORM_LABELS).map(([key, label]) => {
          const count = formCounts[key] || 0
          const disabled = count === 0 && key !== 'all'
          return (
            <FilterChip
              key={key}
              label={label}
              count={count}
              active={filterForm === key}
              onClick={() => setFilterForm(filterForm === key ? 'all' : key)}
              disabled={disabled}
              variant="terra"
            />
          )
        })}
      </div>

      <div style={{ padding: '0 24px' }}>
        {/* Alert filter banner */}
        {alertsOnly && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', marginBottom: 12, marginTop: 12,
            background: '#fffac2', borderRadius: 10, border: '1px solid var(--color-due)',
          }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
              ⚠️ Planten met weeralerts
            </p>
            <button
              onClick={() => navigate('/plants')}
              style={{
                fontSize: 12, color: 'var(--color-text)', background: 'none',
                border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline',
              }}
            >
              Alles tonen
            </button>
          </div>
        )}

        {/* Results bar */}
        {!isLoading && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            padding: '16px 0 18px',
            borderBottom: '1px solid var(--color-border)',
            marginBottom: 18,
          }}>
            <p style={{
              margin: 0,
              fontFamily: 'var(--font-heading)',
              fontStyle: 'italic',
              fontSize: 15,
              color: 'var(--color-text-soft)',
            }}>
              {query ? (
                <>Gevonden: <strong style={{ fontStyle: 'normal', fontWeight: 600, color: 'var(--color-text)' }}>{filtered.length}</strong></>
              ) : (
                <>Toon <strong style={{ fontStyle: 'normal', fontWeight: 600, color: 'var(--color-text)' }}>alle {filtered.length}</strong> planten</>
              )}
            </p>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              color: 'var(--color-text-muted)',
            }}>
              {query
                ? '§ Zoekresultaten'
                : filterArea === 'tuin' ? '§ De Tuin'
                : filterArea === 'huis' ? '§ Huis'
                : filterType !== 'all' ? `§ ${PLANT_TYPE_LABELS[filterType] || filterType}`
                : '§ De Collectie'
              }
            </span>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card" style={{ borderRadius: 14 }}>
                <div className="skeleton" style={{ aspectRatio: '1', borderRadius: '12px 12px 0 0' }} />
                <div style={{ padding: '12px 14px 14px' }}>
                  <div className="skeleton" style={{ height: 16, width: '70%', marginBottom: 6 }} />
                  <div className="skeleton" style={{ height: 12, width: '50%' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 20px', gridColumn: '1 / -1' }}>
            <p style={{
              fontFamily: 'var(--font-heading)',
              fontStyle: 'italic',
              fontSize: 16,
              color: 'var(--color-text-soft)',
              margin: '0 0 6px',
            }}>
              {query ? 'Niets gevonden in deze hoek van de tuin.' : 'Nog geen planten in deze collectie.'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
              {query ? 'Probeer een andere zoekopdracht' : 'Voeg je eerste plant toe via + Toevoegen'}
            </p>
          </div>
        )}

        {/* Plant grid */}
        {!isLoading && filtered.length > 0 && (
          <div className="plants-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 16,
          }}>
            {filtered.map((plant) => (
              <PlantCard key={plant.id} plant={plant} iconMap={iconMap} index={plants.indexOf(plant) + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
  label,
  count,
  disabled,
  variant,
}: {
  active?: boolean
  onClick?: () => void
  children?: React.ReactNode
  label?: string
  count?: number
  disabled?: boolean
  variant?: 'green' | 'terra'
}) {
  // Support both old API (children) and new API (label + count)
  const display = children ?? (
    <>
      {label}
      {count !== undefined && <Count>{count}</Count>}
    </>
  )

  const activeBg = variant === 'terra' ? 'var(--color-secondary)' : 'var(--color-primary)'
  const activeBorder = variant === 'terra' ? 'var(--color-secondary)' : 'var(--color-primary)'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: variant === 'terra' ? '5px 12px' : '7px 15px',
        borderRadius: 100,
        fontSize: variant === 'terra' ? 11 : 13,
        fontWeight: 500,
        fontFamily: 'var(--font-body)',
        border: active ? `1px solid ${activeBorder}` : '1px solid var(--color-border)',
        background: active ? activeBg : 'transparent',
        color: active ? 'var(--color-surface)' : 'var(--color-text-soft)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s ease',
        opacity: disabled && !active ? 0.35 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {display}
    </button>
  )
}

function Count({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ marginLeft: 5, opacity: 0.65, fontVariantNumeric: 'tabular-nums' }}>
      {children}
    </span>
  )
}

function PlantIconWell({ plant, iconMap }: { plant: Plant; iconMap: Map<string, PlantIcon> }) {
  // Has custom SVG icon
  if (plant.icon_key) {
    return (
      <div style={{
        aspectRatio: '1',
        background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)',
        borderBottom: '1px solid var(--color-border-soft)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16%',
        position: 'relative',
      }}>
        <img
          src={`/api/icons/${plant.icon_key}.svg`}
          alt={plant.name}
          style={{ width: '100%', height: '100%', objectFit: 'contain', transition: 'transform 0.3s cubic-bezier(0.2,0.8,0.2,1)' }}
          className="card-icon"
        />
      </div>
    )
  }

  // Fallback: warm gradient base + subtle type color accent bar
  const type = plant.plant_type || 'unknown'
  const accentColor = TYPE_BG[type] || TYPE_BG.unknown
  const iconBody = PLANT_ICONS[type] || PLANT_ICONS['unknown']

  return (
    <div style={{
      aspectRatio: '1',
      background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)',
      borderBottom: '1px solid var(--color-border-soft)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '18%',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        background: accentColor,
        opacity: 0.4,
        borderRadius: '0 0 0 3px',
      }} />
      <svg
        viewBox="0 0 100 100"
        style={{ width: '100%', height: '100%', transition: 'transform 0.3s cubic-bezier(0.2,0.8,0.2,1)' }}
        className="card-icon"
        dangerouslySetInnerHTML={{ __html: iconBody }}
      />
    </div>
  )
}

function PlantCard({ plant, iconMap, index }: { plant: Plant; iconMap: Map<string, PlantIcon>; index: number }) {
  const icon = plant.icon_key ? iconMap.get(plant.icon_key) : null
  const typeLabel = icon?.cat || plant.plant_type || null
  const typeDisplay = typeLabel ? (CATEGORY_LABELS[typeLabel] || typeLabel) : null
  const formLabel = icon?.form || null
  const familyName = icon?.family || null

  return (
    <Link
      to={`/plants/${plant.id}`}
      className="card card-glow no-underline block"
      style={{ borderRadius: 14, overflow: 'hidden', color: 'inherit', textDecoration: 'none' }}
    >
      <div style={{ position: 'relative' }}>
        <PlantIconWell plant={plant} iconMap={iconMap} />

        {/* Category tag — top left */}
        {typeDisplay && (
          <span style={{
            position: 'absolute',
            top: 8,
            left: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--color-text-muted)',
            background: 'rgba(251,247,238,0.92)',
            padding: '2px 7px',
            borderRadius: 5,
            border: '1px solid var(--color-border-soft)',
          }}>
            {typeLabel}
          </span>
        )}

        {/* Index number — top right, visible on hover */}
        <span style={{
          position: 'absolute',
          top: 8,
          right: 8,
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--color-text-muted)',
          opacity: 0,
          transition: 'opacity 0.2s',
        }} className="card-index">
          {String(index).padStart(2, '0')}
        </span>

        {/* Form tag — bottom right */}
        {formLabel && (
          <span style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: formLabel === 'potted' ? 'var(--color-primary)' : 'var(--color-secondary)',
            background: 'rgba(251,247,238,0.92)',
            padding: '2px 7px',
            borderRadius: 5,
            border: '1px solid var(--color-border-soft)',
          }}>
            {formLabel}
          </span>
        )}
      </div>

      <div style={{ padding: '12px 14px 14px' }}>
        <h3 style={{
          margin: 0,
          fontFamily: 'var(--font-heading)',
          fontWeight: 500,
          fontSize: 16,
          lineHeight: 1.15,
          color: 'var(--color-text)',
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {plant.name}
        </h3>
        {plant.species && (
          <p style={{
            margin: '2px 0 0',
            fontFamily: 'var(--font-heading)',
            fontStyle: 'italic',
            fontSize: 12,
            color: 'var(--color-text-soft)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {plant.species}
          </p>
        )}
        {familyName && (
          <p style={{
            margin: '10px 0 0',
            paddingTop: 8,
            borderTop: '1px dashed var(--color-border)',
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--color-text-muted)',
          }}>
            {familyName}
          </p>
        )}
      </div>
    </Link>
  )
}
