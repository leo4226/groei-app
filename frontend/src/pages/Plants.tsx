import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { PLANT_ICONS } from '../constants/plantIcons'
import { useCategoryLabels, useTypeLabels, useFormLabels } from '../constants/plantLabels'
import { useT } from '../context/LanguageContext'
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

/** Detect small screen via matchMedia */
function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 720px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)')
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return mobile
}

export default function Plants() {
  const { plants, isLoading } = useFloreren()
  const CATEGORY_LABELS = useCategoryLabels()
  const PLANT_TYPE_LABELS = useTypeLabels()
  const FORM_LABELS = useFormLabels()
  const t = useT()
  const isMobile = useIsMobile()
  const [filterArea, setFilterArea] = useState<'all' | 'tuin' | 'huis'>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterForm, setFilterForm] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const alertsOnly = searchParams.get('alerts') === '1'
  const [alertPlantIds, setAlertPlantIds] = useState<number[] | null>(null)
  const [iconCatalog, setIconCatalog] = useState<PlantIcon[]>([])
  const [showFilterSheet, setShowFilterSheet] = useState(false)

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

  const iconMap = useMemo(() => {
    const m = new Map<string, PlantIcon>()
    iconCatalog.forEach(icon => m.set(icon.id, icon))
    return m
  }, [iconCatalog])

  const tuinCount = plants.filter(isTuin).length
  const huisCount = plants.filter(p => !isTuin(p)).length

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    plants.forEach(p => {
      const t = p.plant_type || 'unknown'
      counts[t] = (counts[t] || 0) + 1
    })
    counts.all = plants.length
    return counts
  }, [plants])

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

  // ───────────── Mutually exclusive: only one filter active ─────────────
  const activeFilter = ['all', 'tuin', 'huis'].includes(filterArea) && filterArea !== 'all'
    ? `area:${filterArea}`
    : filterType !== 'all'
    ? `type:${filterType}`
    : filterForm !== 'all'
    ? `form:${filterForm}`
    : null

  const clearFilters = () => {
    setFilterArea('all')
    setFilterType('all')
    setFilterForm('all')
    setQuery('')
  }

  const hasActiveFilters = filterArea !== 'all' || filterType !== 'all' || filterForm !== 'all' || !!query

  const categoryCount = new Set(plants.map(p => p.plant_type).filter(Boolean)).size

  // ──────────────────────── DESKTOP LAYOUT ────────────────────────
  if (!isMobile) {
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
              {t.plantsPage.subtitleEst}
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
              {t.plantsPage.title} <em style={{ fontStyle: 'italic', color: 'var(--color-primary)', fontWeight: 400 }}>Icons</em>.
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
              {t.plantsPage.subtitle}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 28 }}>
            <div style={{ textAlign: 'right' }}>
              <span style={{
                fontFamily: 'var(--font-heading)', fontSize: 34, fontWeight: 500,
                lineHeight: 1, color: 'var(--color-primary)', display: 'block',
              }}>{plants.length}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase',
                letterSpacing: '0.15em', color: 'var(--color-text-muted)', marginTop: 4,
              }}>{t.plantsPage.countPlants}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{
                fontFamily: 'var(--font-heading)', fontSize: 34, fontWeight: 500,
                lineHeight: 1, color: 'var(--color-primary)', display: 'block',
              }}>{categoryCount}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase',
                letterSpacing: '0.15em', color: 'var(--color-text-muted)', marginTop: 4,
              }}>{t.plantsPage.countCategories}</span>
            </div>
          </div>
        </header>

        {/* Search bar */}
        <div style={{ padding: '20px 24px 0', display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
            </svg>
            <input id="plant-search" type="text" value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t.plantsPage.searchPlaceholder}
              style={{
                width: '100%', padding: '13px 50px 13px 42px', borderRadius: 100,
                border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                color: 'var(--color-text)', fontSize: 15, fontFamily: 'var(--font-heading)',
                boxShadow: '0 1px 2px rgba(31,42,30,0.04)', boxSizing: 'border-box', outline: 'none',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(47,93,58,0.12), 0 1px 2px rgba(31,42,30,0.04)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(31,42,30,0.04)'; }}
            />
            <span style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)',
              background: 'var(--color-bg-warm)', padding: '3px 7px', borderRadius: 5,
              border: '1px solid var(--color-border)', pointerEvents: 'none',
            }}>
              {navigator.platform.toLowerCase().includes('mac') ? '⌘K' : 'Ctrl K'}
            </span>
          </div>
          <button onClick={() => navigate('/plants/add')} style={{
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
            color: 'var(--color-primary)', textDecoration: 'none', padding: '10px 16px',
            border: '1px solid var(--color-primary)', borderRadius: 100, whiteSpace: 'nowrap',
            transition: 'all 0.15s', flexShrink: 0, background: 'transparent', cursor: 'pointer',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-surface)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-primary)'; }}
          >
            {t.plantsPage.addButton}
          </button>
        </div>

        {/* Filters — desktop rows */}
        <div className="plants-filter-strip">
          <div className="filter-row" style={{ padding: '14px 24px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="filter-label" style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase',
              letterSpacing: '0.2em', color: 'var(--color-text-muted)', flexShrink: 0, minWidth: 48,
            }}>{t.plantsPage.filterLocation}</span>
            <FilterChip label={t.plantsPage.filterAll} count={plants.length} active={filterArea === 'all'} onClick={() => setFilterArea('all')} />
            <FilterChip label={t.plantsPage.filterHouse} count={huisCount} active={filterArea === 'huis'} onClick={() => setFilterArea('huis')} />
            <FilterChip label={t.plantsPage.filterGarden} count={tuinCount} active={filterArea === 'tuin'} onClick={() => setFilterArea('tuin')} />
          </div>
          <div className="filter-row" style={{ padding: '6px 24px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="filter-label" style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase',
              letterSpacing: '0.2em', color: 'var(--color-text-muted)', flexShrink: 0, minWidth: 48,
            }}>{t.plantsPage.filterType}</span>
            <FilterChip label={t.plantsPage.filterAll} count={typeCounts.all} active={filterType === 'all'} onClick={() => setFilterType('all')} />
            {Object.entries(PLANT_TYPE_LABELS).map(([key, label]) => {
              const count = typeCounts[key] || 0
              if (count === 0) return null
              return (
                <FilterChip key={key} label={label} count={count}
                  active={filterType === key} onClick={() => setFilterType(filterType === key ? 'all' : key)}
                />
              )
            })}
          </div>
          <div className="filter-row" style={{ padding: '6px 24px 8px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="filter-label" style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase',
              letterSpacing: '0.2em', color: 'var(--color-text-muted)', flexShrink: 0, minWidth: 48,
            }}>{t.plantsPage.filterForm}</span>
            {Object.entries(FORM_LABELS).map(([key, label]) => {
              const count = formCounts[key] || 0
              const disabled = count === 0 && key !== 'all'
              return (
                <FilterChip key={key} label={label} count={count}
                  active={filterForm === key} onClick={() => setFilterForm(filterForm === key ? 'all' : key)}
                  disabled={disabled} variant="terra"
                />
              )
            })}
          </div>
        </div>

        {/* Results & plant grid – shared */}
        <div style={{ padding: '0 24px' }}>
          {alertsOnly && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', marginBottom: 12, marginTop: 12,
              background: '#fffac2', borderRadius: 10, border: '1px solid var(--color-due)',
            }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
                {t.plantsPage.alertBanner}
              </p>
              <button onClick={() => navigate('/plants')} style={{
                fontSize: 12, color: 'var(--color-text)', background: 'none',
                border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline',
              }}>
                {t.plantsPage.alertShowAll}
              </button>
            </div>
          )}
          <ResultsBar />
          <LoadingSkeleton />
          <EmptyState />
          <PlantGrid />
        </div>
      </div>
    )
  }

  // ───────────────────────── MOBILE LAYOUT ─────────────────────────
  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Sticky compact header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'var(--color-bg)', paddingTop: 12,
      }}>
        {/* Title row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px 8px',
        }}>
          <h1 style={{
            fontFamily: 'var(--font-heading)', fontWeight: 500,
            fontSize: 22, letterSpacing: '-0.01em',
            color: 'var(--color-text)', margin: 0,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {t.plantsPage.title}
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              fontWeight: 400, color: 'var(--color-text-muted)',
              background: 'var(--color-surface)', padding: '2px 8px',
              borderRadius: 20, border: '1px solid var(--color-border)',
            }}>{filtered.length}</span>
          </h1>
          <button onClick={() => navigate('/plants/add')} style={{
            fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
            color: 'var(--color-surface)', background: 'var(--color-primary)',
            border: 'none', borderRadius: 100, padding: '6px 14px',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {t.plantsPage.addButton}
          </button>
        </div>

        {/* Search bar */}
        <div style={{ padding: '0 16px 8px', position: 'relative' }}>
          <svg style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none', zIndex: 1 }}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
          </svg>
          <input
            type="text" value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t.plantsPage.searchPlaceholder}
            style={{
              width: '100%', padding: '10px 38px', borderRadius: 100,
              border: '1px solid var(--color-border)', background: 'var(--color-surface)',
              color: 'var(--color-text)', fontSize: 14,
              fontFamily: 'var(--font-heading)',
              boxSizing: 'border-box', outline: 'none',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
          />
        </div>

        {/* Filter button — opens bottom sheet */}
        <div style={{ padding: '0 16px 10px' }}>
          <button
            onClick={() => setShowFilterSheet(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 100,
              border: '1px solid var(--color-border)',
              background: hasActiveFilters ? 'var(--color-primary)' : 'transparent',
              color: hasActiveFilters ? 'var(--color-surface)' : 'var(--color-text-soft)',
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
              cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            >
              <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
              <circle cx="4" cy="14" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="20" cy="16" r="2" />
            </svg>
            {t.plantsPage.filterButton}
            {hasActiveFilters && (
              <span style={{
                background: 'var(--color-surface)', color: 'var(--color-primary)',
                fontSize: 9, fontWeight: 600, borderRadius: 20,
                padding: '1px 6px', lineHeight: '16px',
              }}>
                {(filterArea !== 'all' ? 1 : 0) + (filterType !== 'all' ? 1 : 0) + (filterForm !== 'all' ? 1 : 0)}
              </span>
            )}
          </button>
        </div>

        {/* Filter bottom sheet */}
        {showFilterSheet && (
          <>
            {/* Overlay */}
            <div
              onClick={() => setShowFilterSheet(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 200,
                background: 'rgba(0,0,0,0.4)',
              }}
            />
            {/* Sheet */}
            <div
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 210,
                background: 'var(--color-surface)',
                borderTopLeftRadius: 24, borderTopRightRadius: 24,
                borderTop: '2px solid var(--color-primary)',
                boxShadow: '0 -8px 30px rgba(0,0,0,0.15)',
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
                maxHeight: '70vh', overflowY: 'auto',
                animation: 'slide-up 0.25s ease-out',
              }}
            >
              {/* Drag handle */}
              <div style={{
                width: 40, height: 4,
                background: 'var(--color-border)',
                borderRadius: 999, margin: '12px auto 8px',
              }} />
              <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Location */}
                <div>
                  <p style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    textTransform: 'uppercase', letterSpacing: '0.2em',
                    color: 'var(--color-text-muted)', margin: '0 0 8px 0',
                  }}>
                    {t.plantsPage.filterLocation}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <FilterChip label={t.plantsPage.filterAll} count={plants.length}
                      active={filterArea === 'all'} onClick={() => setFilterArea('all')} />
                    <FilterChip label={t.plantsPage.filterHouse} count={huisCount}
                      active={filterArea === 'huis'} onClick={() => setFilterArea('huis')} />
                    <FilterChip label={t.plantsPage.filterGarden} count={tuinCount}
                      active={filterArea === 'tuin'} onClick={() => setFilterArea('tuin')} />
                  </div>
                </div>

                {/* Type */}
                <div>
                  <p style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    textTransform: 'uppercase', letterSpacing: '0.2em',
                    color: 'var(--color-text-muted)', margin: '0 0 8px 0',
                  }}>
                    {t.plantsPage.filterType}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <FilterChip label={t.plantsPage.filterAll} count={typeCounts.all}
                      active={filterType === 'all'} onClick={() => setFilterType('all')} />
                    {Object.entries(PLANT_TYPE_LABELS).map(([key, label]) => {
                      const count = typeCounts[key] || 0
                      if (count === 0) return null
                      return (
                        <FilterChip key={key} label={label} count={count}
                          active={filterType === key}
                          onClick={() => setFilterType(filterType === key ? 'all' : key)}
                        />
                      )
                    })}
                  </div>
                </div>

                {/* Form */}
                <div>
                  <p style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    textTransform: 'uppercase', letterSpacing: '0.2em',
                    color: 'var(--color-text-muted)', margin: '0 0 8px 0',
                  }}>
                    {t.plantsPage.filterForm}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(FORM_LABELS).map(([key, label]) => {
                      const count = formCounts[key] || 0
                      const disabled = count === 0 && key !== 'all'
                      return (
                        <FilterChip key={key} label={label} count={count}
                          active={filterForm === key}
                          onClick={() => setFilterForm(filterForm === key ? 'all' : key)}
                          disabled={disabled} variant="terra"
                        />
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Main content */}
      <div style={{ padding: '0 16px' }}>
        {alertsOnly && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', marginBottom: 10,
            background: '#fffac2', borderRadius: 10, border: '1px solid var(--color-due)',
          }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
              {t.plantsPage.alertBanner}
            </p>
            <button onClick={() => navigate('/plants')} style={{
              fontSize: 12, color: 'var(--color-text)', background: 'none',
              border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline',
            }}>
              {t.plantsPage.alertShowAll}
            </button>
          </div>
        )}

        <ResultsBar />
        <LoadingSkeleton />
        <EmptyState />
        <PlantGrid />
      </div>
    </div>
  )

  // ─────────── Shared sub-components ───────────

  function ResultsBar() {
    return !isLoading && (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        padding: '12px 0 14px',
        borderBottom: '1px solid var(--color-border)',
        marginBottom: 14,
      }}>
        <p style={{
          margin: 0, fontFamily: 'var(--font-heading)', fontStyle: 'italic',
          fontSize: isMobile ? 13 : 15, color: 'var(--color-text-soft)',
        }}>
          {query
            ? t.plantsPage.found(filtered.length)
            : t.plantsPage.showAll(filtered.length)
          }
        </p>
        {!isMobile && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase',
            letterSpacing: '0.2em', color: 'var(--color-text-muted)',
          }}>
            {query
              ? t.plantsPage.sectionSearchResults
              : filterArea === 'tuin' ? t.plantsPage.sectionGarden
              : filterArea === 'huis' ? t.plantsPage.sectionHouse
              : filterType !== 'all' ? `§ ${PLANT_TYPE_LABELS[filterType] || filterType}`
              : t.plantsPage.sectionCollection
            }
          </span>
        )}
      </div>
    )
  }

  function LoadingSkeleton() {
    return isLoading ? (
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: isMobile ? 10 : 16,
      }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card" style={{ borderRadius: 14 }}>
            <div className="skeleton" style={{ aspectRatio: '1', borderRadius: '12px 12px 0 0' }} />
            <div style={{ padding: '10px 12px 12px' }}>
              <div className="skeleton" style={{ height: 14, width: '70%', marginBottom: 4 }} />
              <div className="skeleton" style={{ height: 10, width: '50%' }} />
            </div>
          </div>
        ))}
      </div>
    ) : null
  }

  function EmptyState() {
    return !isLoading && filtered.length === 0 ? (
      <div style={{ textAlign: 'center', padding: isMobile ? '40px 20px' : '80px 20px' }}>
        <p style={{
          fontFamily: 'var(--font-heading)', fontStyle: 'italic',
          fontSize: isMobile ? 14 : 16, color: 'var(--color-text-soft)',
          margin: '0 0 6px',
        }}>
          {query ? t.plantsPage.emptySearch : t.plantsPage.emptyNoPlants}
        </p>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
          {query ? t.plantsPage.emptySearchHint : t.plantsPage.emptyNoPlantsHint}
        </p>
      </div>
    ) : null
  }

  function PlantGrid() {
    return !isLoading && filtered.length > 0 ? (
      <div className="plants-grid" style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: isMobile ? 10 : 16,
      }}>
        {filtered.map((plant) => (
          <PlantCard key={plant.id} plant={plant} iconMap={iconMap} index={plants.indexOf(plant) + 1} />
        ))}
      </div>
    ) : null
  }
}

// ─────────── Shared styled components ───────────

function FilterChip({
  active, onClick, label, count, disabled, variant, compact, children,
}: {
  active?: boolean
  onClick?: () => void
  label?: string
  count?: number
  disabled?: boolean
  variant?: 'green' | 'terra'
  compact?: boolean
  children?: React.ReactNode
}) {
  const display = children ?? (
    <>{label}{count !== undefined && <Count>{count}</Count>}</>
  )
  const activeBg = variant === 'terra' ? 'var(--color-secondary)' : 'var(--color-primary)'
  const activeBorder = variant === 'terra' ? 'var(--color-secondary)' : 'var(--color-primary)'

  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: compact ? '5px 10px' : variant === 'terra' ? '5px 12px' : '7px 15px',
      borderRadius: 100, fontSize: compact ? 10 : variant === 'terra' ? 11 : 13,
      fontWeight: 500, fontFamily: 'var(--font-body)',
      border: active ? `1px solid ${activeBorder}` : '1px solid var(--color-border)',
      background: active ? activeBg : 'transparent',
      color: active ? 'var(--color-surface)' : 'var(--color-text-soft)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.15s ease',
      opacity: disabled && !active ? 0.35 : 1,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {display}
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

function PlantIconWell({ plant, iconMap }: { plant: Plant; iconMap: Map<string, PlantIcon> }) {
  if (plant.icon_key) {
    return (
      <div style={{
        aspectRatio: '1',
        background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)',
        borderBottom: '1px solid var(--color-border-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16%', position: 'relative',
      }}>
        <img src={`/icons/${plant.icon_key}.svg`} alt={plant.name}
          style={{ width: '100%', height: '100%', objectFit: 'contain', transition: 'transform 0.3s cubic-bezier(0.2,0.8,0.2,1)' }}
          className="card-icon"
        />
      </div>
    )
  }

  const type = plant.plant_type || 'unknown'
  const accentColor = TYPE_BG[type] || TYPE_BG.unknown
  const iconBody = PLANT_ICONS[type] || PLANT_ICONS['unknown']

  return (
    <div style={{
      aspectRatio: '1',
      background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)',
      borderBottom: '1px solid var(--color-border-soft)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '18%', position: 'relative',
    }}>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
        background: accentColor, opacity: 0.4, borderRadius: '0 0 0 3px',
      }} />
      <svg viewBox="0 0 100 100"
        style={{ width: '100%', height: '100%', transition: 'transform 0.3s cubic-bezier(0.2,0.8,0.2,1)' }}
        className="card-icon"
        dangerouslySetInnerHTML={{ __html: iconBody }}
      />
    </div>
  )
}

function PlantCard({ plant, iconMap, index }: { plant: Plant; iconMap: Map<string, PlantIcon>; index: number }) {
  const CATEGORY_LABELS = useCategoryLabels()
  const icon = plant.icon_key ? iconMap.get(plant.icon_key) : null
  const typeLabel = icon?.cat || plant.plant_type || null
  const typeDisplay = typeLabel ? (CATEGORY_LABELS[typeLabel] || typeLabel) : null
  const formLabel = icon?.form || null
  const familyName = icon?.family || null

  return (
    <Link to={`/plants/${plant.id}`}
      className="card card-glow no-underline block"
      style={{ borderRadius: 14, overflow: 'hidden', color: 'inherit', textDecoration: 'none' }}
    >
      <div style={{ position: 'relative' }}>
        <PlantIconWell plant={plant} iconMap={iconMap} />
        {typeDisplay && (
          <span style={{
            position: 'absolute', top: 6, left: 6,
            fontFamily: 'var(--font-mono)', fontSize: 7, textTransform: 'uppercase',
            letterSpacing: '0.1em', color: 'var(--color-text-muted)',
            background: 'rgba(251,247,238,0.92)', padding: '2px 6px',
            borderRadius: 4, border: '1px solid var(--color-border-soft)',
          }}>
            {typeLabel}
          </span>
        )}
        {formLabel && (
          <span style={{
            position: 'absolute', bottom: 6, right: 6,
            fontFamily: 'var(--font-mono)', fontSize: 7, textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: formLabel === 'potted' ? 'var(--color-primary)' : 'var(--color-secondary)',
            background: 'rgba(251,247,238,0.92)', padding: '2px 6px',
            borderRadius: 4, border: '1px solid var(--color-border-soft)',
          }}>
            {formLabel}
          </span>
        )}
      </div>
      <div style={{ padding: '10px 12px 12px' }}>
        <h3 style={{
          margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 500,
          fontSize: 14, lineHeight: 1.2, color: 'var(--color-text)',
          letterSpacing: '-0.01em', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {plant.name}
        </h3>
        {plant.species && (
          <p style={{
            margin: '1px 0 0', fontFamily: 'var(--font-heading)', fontStyle: 'italic',
            fontSize: 11, color: 'var(--color-text-soft)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {plant.species}
          </p>
        )}
        {familyName && (
          <p style={{
            margin: '6px 0 0', paddingTop: 6,
            borderTop: '1px dashed var(--color-border)',
            fontFamily: 'var(--font-mono)', fontSize: 8,
            textTransform: 'uppercase', letterSpacing: '0.1em',
            color: 'var(--color-text-muted)',
          }}>
            {familyName}
          </p>
        )}
      </div>
    </Link>
  )
}
