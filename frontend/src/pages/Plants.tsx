import { useState, useEffect, useMemo, lazy, Suspense, useRef } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { PLANT_ICONS } from '../constants/plantIcons'
import { useCategoryLabels, useTypeLabels, useFormLabels } from '../constants/plantLabels'
import { useT } from '../context/LanguageContext'
import type { Plant, PlantIcon } from '../types'
import { alerts, icons } from '../api/client'
import { resolveIconUrl } from '../utils/icons'
import { plantDisplayName, plantSearchText } from '../utils/plantDisplayName'
import Glyph from '../components/ui/Glyph'
import PageDecor from '../components/PageDecor'

const DiscoveriesSection = lazy(() => import('../components/discoveries/DiscoveriesSection'))
import RecentCareSection from '../components/plants/RecentCareSection'
import PlantFactCard from '../components/plants/PlantFactCard'

/**
 * The category/type/form i18n labels carry a leading emoji (e.g. "🪴 Potted").
 * The tiny uppercase metadata chips on a plant card render text only, so strip
 * the leading non-letter characters and keep just the localized word.
 */
const stripLabelEmoji = (label: string): string => label.replace(/^[^\p{L}]+/u, '').trim() || label

/** Plant is outdoor (tuin) when its map has map_type='outdoor'. Null map_id → fallback to huis. */
const isOutdoor = (plant: Plant, mapTypeByMapId: Map<number, 'outdoor' | 'indoor'>) => {
  if (plant.map_id == null) return false
  return mapTypeByMapId.get(plant.map_id) === 'outdoor'
}

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
  const { plants, isLoading, maps } = useFloreren()
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
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [activeTab, setActiveTab] = useState<'plants' | 'journal'>('plants')

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setIsSelecting(false)
  }

  const { bulkArchivePlants } = useFloreren()

  const handleBulkArchive = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    const msg = t.plantsPage.bulkArchiveConfirm(ids.length)
    if (!window.confirm(msg)) return
    await bulkArchivePlants(ids)
    clearSelection()
  }

  useEffect(() => {
    icons.catalog().then(setIconCatalog).catch(() => {})
  }, [])

  useEffect(() => {
    if (alertsOnly) {
      alerts.summary()
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

  const mapTypeByMapId = useMemo(() => {
    const m = new Map<number, 'outdoor' | 'indoor'>()
    maps.forEach(map => m.set(map.id, map.map_type))
    return m
  }, [maps])

  const tuinCount = plants.filter(p => isOutdoor(p, mapTypeByMapId)).length
  const huisCount = plants.filter(p => !isOutdoor(p, mapTypeByMapId)).length

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
    if (filterArea === 'tuin' && !isOutdoor(p, mapTypeByMapId)) return false
    if (filterArea === 'huis' && isOutdoor(p, mapTypeByMapId)) return false
    if (filterType !== 'all' && (p.plant_type || 'unknown') !== filterType) return false
    if (filterForm !== 'all') {
      const icon = p.icon_key ? iconMap.get(p.icon_key) : null
      const form = icon?.form || 'other'
      if (form !== filterForm) return false
    }
    if (query) {
      const q = query.toLowerCase()
      return plantSearchText(p, t.locale).includes(q)
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

  const hasActiveFilters = filterArea !== 'all' || filterType !== 'all' || filterForm !== 'all' || !!query
  const activeFilterCount = (filterArea !== 'all' ? 1 : 0) + (filterType !== 'all' ? 1 : 0) + (filterForm !== 'all' ? 1 : 0) + (query ? 1 : 0)

  const categoryCount = new Set(plants.map(p => p.plant_type).filter(Boolean)).size
  const activeTypeLabel = filterType !== 'all' ? PLANT_TYPE_LABELS[filterType] || filterType : null
  const activeFormLabel = filterForm !== 'all' ? FORM_LABELS[filterForm] || filterForm : null
  const typeFilterOptions = Object.entries(PLANT_TYPE_LABELS).filter(([key]) => key === filterType || (typeCounts[key] || 0) > 0)
  const formFilterOptions = Object.entries(FORM_LABELS).filter(([key]) => key === 'all' || key === filterForm || (formCounts[key] || 0) > 0)

  const clearCollectionFilters = () => {
    setQuery('')
    setFilterArea('all')
    setFilterType('all')
    setFilterForm('all')
  }

  // ──────────────────────── DESKTOP LAYOUT ────────────────────────
  if (!isMobile) {
    return (
      <div style={{ paddingBottom: 80 }}>
        {/* Header */}
        <header className="plants-header" style={{
          maxWidth: 1800,
          margin: '0 auto',
          padding: '40px clamp(24px, 3vw, 56px) 20px',
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
              {t.plantsPage.title}.
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

        <main style={{ maxWidth: 1800, margin: '0 auto', padding: '20px clamp(24px, 3vw, 56px) 0' }}>

          {/* ── Primary tab navigation — plants vs. field journal ── */}
          <nav aria-label="Plant collection" style={{
            display: 'flex', justifyContent: 'center', marginBottom: 18,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 2, padding: 3,
              borderRadius: 100, border: '1px solid var(--color-border)',
              background: 'color-mix(in srgb, var(--color-bg-warm) 78%, var(--color-surface))',
              boxShadow: '0 3px 10px rgba(31,42,30,0.04)',
            }}>
              <button
                onClick={() => setActiveTab('plants')}
                style={{
                  fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: activeTab === 'plants' ? 600 : 500,
                  padding: '10px 22px', borderRadius: 100, cursor: 'pointer', border: 'none',
                  background: activeTab === 'plants' ? 'var(--color-primary)' : 'transparent',
                  color: activeTab === 'plants' ? '#fff' : 'var(--color-text-soft)',
                  transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={e => { if (activeTab !== 'plants') e.currentTarget.style.background = 'var(--color-surface)' }}
                onMouseLeave={e => { if (activeTab !== 'plants') e.currentTarget.style.background = 'transparent' }}
              >
                <Glyph name="sprout" size={17} strokeWidth={2} />
                {t.discovery.myPlantsTab}
              </button>
              <button
                onClick={() => setActiveTab('journal')}
                style={{
                  fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: activeTab === 'journal' ? 600 : 500,
                  padding: '10px 22px', borderRadius: 100, cursor: 'pointer', border: 'none',
                  background: activeTab === 'journal' ? 'var(--color-primary)' : 'transparent',
                  color: activeTab === 'journal' ? '#fff' : 'var(--color-text-soft)',
                  transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={e => { if (activeTab !== 'journal') e.currentTarget.style.background = 'var(--color-surface)' }}
                onMouseLeave={e => { if (activeTab !== 'journal') e.currentTarget.style.background = 'transparent' }}
              >
                <Glyph name="book" size={17} strokeWidth={2} />
                {t.discovery.journalTab}
              </button>
            </div>
          </nav>

          <section aria-label={t.plantsPage.filterButton} style={{
            border: '1px solid var(--color-border)',
            borderRadius: 28,
            background: 'color-mix(in srgb, var(--color-surface) 82%, transparent)',
            boxShadow: '0 12px 36px rgba(31,42,30,0.05)',
            padding: 16,
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(320px, 1fr) auto',
              gap: 16,
              alignItems: 'center',
            }}>
              <div style={{ position: 'relative' }}>
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

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button onClick={() => navigate('/identify', { state: { mode: 'discover' } })} style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                  color: 'var(--color-text-soft)', padding: '10px 16px',
                  border: '1px solid var(--color-border)', borderRadius: 100, whiteSpace: 'nowrap',
                  transition: 'all 0.15s', flexShrink: 0, background: 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-primary)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-soft)'; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  {t.discovery.identifyWild}
                </button>
                <button onClick={() => navigate('/photo-round')} style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                  color: 'var(--color-text-soft)', padding: '10px 16px',
                  border: '1px solid var(--color-border)', borderRadius: 100, whiteSpace: 'nowrap',
                  transition: 'all 0.15s', flexShrink: 0, background: 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-primary)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-soft)'; }}
                >
                  {t.photoRound.startFromPlants}
                </button>
                <button onClick={() => navigate('/plants/add')} style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                  color: 'var(--color-surface)', textDecoration: 'none', padding: '10px 17px',
                  border: '1px solid var(--color-primary)', borderRadius: 100, whiteSpace: 'nowrap',
                  transition: 'all 0.15s', flexShrink: 0, background: 'var(--color-primary)', cursor: 'pointer',
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  {t.plantsPage.addButton}
                </button>
                {isSelecting ? (
                  <button onClick={clearSelection} style={{
                    fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                    color: 'var(--color-text-soft)', padding: '10px 16px',
                    border: '1px solid var(--color-border)', borderRadius: 100, whiteSpace: 'nowrap',
                    transition: 'all 0.15s', flexShrink: 0, background: 'transparent', cursor: 'pointer',
                  }}>
                    {t.common.cancel}
                  </button>
                ) : (
                  <button onClick={() => setIsSelecting(true)} style={{
                    fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                    color: 'var(--color-text-soft)', padding: '10px 16px',
                    border: '1px solid var(--color-border)', borderRadius: 100, whiteSpace: 'nowrap',
                    transition: 'all 0.15s', flexShrink: 0, background: 'transparent', cursor: 'pointer',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-primary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-soft)'; }}
                  >
                    {t.plantsPage.select}
                  </button>
                )}
              </div>
            </div>

            {activeTab === 'plants' && (
              <div style={{
                marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border-soft)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 16, flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase',
                    letterSpacing: '0.2em', color: 'var(--color-text-muted)', marginRight: 2,
                  }}>{t.plantsPage.filterButton}</span>
                  <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{
                    minWidth: 150, padding: '8px 34px 8px 12px', borderRadius: 100,
                    border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                    color: 'var(--color-text-soft)', fontFamily: 'var(--font-body)', fontSize: 12,
                    outline: 'none', cursor: 'pointer',
                  }}>
                    <option value="all">{t.plantsPage.filterType}: {t.plantsPage.filterAll} ({typeCounts.all})</option>
                    {typeFilterOptions.map(([key, label]) => (
                      <option key={key} value={key}>{stripLabelEmoji(label)} ({typeCounts[key] || 0})</option>
                    ))}
                  </select>
                  <select value={filterForm} onChange={e => setFilterForm(e.target.value)} style={{
                    minWidth: 150, padding: '8px 34px 8px 12px', borderRadius: 100,
                    border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                    color: 'var(--color-text-soft)', fontFamily: 'var(--font-body)', fontSize: 12,
                    outline: 'none', cursor: 'pointer',
                  }}>
                    {formFilterOptions.map(([key, label]) => (
                      <option key={key} value={key}>{key === 'all' ? `${t.plantsPage.filterForm}: ${label}` : stripLabelEmoji(label)} ({formCounts[key] || 0})</option>
                    ))}
                  </select>
                  {hasActiveFilters && (
                    <button onClick={clearCollectionFilters} style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.16em',
                      color: 'var(--color-primary)', border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 0',
                    }}>
                      {t.plantsPage.alertShowAll}
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase',
                    letterSpacing: '0.2em', color: 'var(--color-text-muted)', marginRight: 2,
                  }}>{t.plantsPage.filterLocation}</span>
                  <FilterChip active={filterArea === 'all'} onClick={() => setFilterArea('all')}>
                    {t.plantsPage.filterAll}<Count>{plants.length}</Count>
                  </FilterChip>
                  <FilterChip active={filterArea === 'huis'} onClick={() => setFilterArea('huis')}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Glyph name="home" size={14} strokeWidth={2} />
                      {t.plantsPage.filterHouse}<Count>{huisCount}</Count>
                    </span>
                  </FilterChip>
                  <FilterChip active={filterArea === 'tuin'} onClick={() => setFilterArea('tuin')}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Glyph name="leaf" size={14} strokeWidth={2} />
                      {t.plantsPage.filterGarden}<Count>{tuinCount}</Count>
                    </span>
                  </FilterChip>
                </div>
              </div>
            )}

            {activeTab === 'plants' && (activeTypeLabel || activeFormLabel) && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                {activeTypeLabel && (
                  <FilterChip compact active onClick={() => setFilterType('all')}>
                    {stripLabelEmoji(activeTypeLabel)} ×
                  </FilterChip>
                )}
                {activeFormLabel && (
                  <FilterChip compact active variant="terra" onClick={() => setFilterForm('all')}>
                    {stripLabelEmoji(activeFormLabel)} ×
                  </FilterChip>
                )}
              </div>
            )}
          </section>

          {activeTab === 'journal' && (
            <div style={{ marginTop: 18 }}>
              <Suspense fallback={<div style={{ padding: 24, color: 'var(--color-text-soft)' }}>...</div>}>
                <DiscoveriesSection />
              </Suspense>
            </div>
          )}

          {activeTab === 'plants' && alertsOnly && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', marginBottom: 12, marginTop: 18,
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

          {activeTab === 'plants' && (
            <>
              <section style={{ marginTop: alertsOnly ? 0 : 18 }}>
                <ResultsBar />
                <LoadingSkeleton />
                <EmptyState />
                <PlantGrid />
              </section>
              {!isSelecting && (
                <section style={{ marginTop: 28 }}>
                  <PlantFactCard />
                  <RecentCareSection />
                </section>
              )}
            </>
          )}

          {isSelecting && (
            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
              background: 'var(--color-surface)',
              borderTop: '1px solid var(--color-border)',
              padding: '12px 16px',
              paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              boxShadow: '0 -2px 12px rgba(0,0,0,0.06)',
            }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)' }}>
                {t.plantsPage.selected(selectedIds.size)}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={clearSelection} style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                  padding: '8px 16px', borderRadius: 100, cursor: 'pointer',
                  border: '1px solid var(--color-border)', background: 'transparent',
                  color: 'var(--color-text)',
                }}>
                  {t.common.cancel}
                </button>
                <button onClick={handleBulkArchive} disabled={selectedIds.size === 0} style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                  padding: '8px 16px', borderRadius: 100, cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer',
                  border: 'none', background: selectedIds.size === 0 ? 'var(--color-border)' : 'var(--color-primary)',
                  color: 'var(--color-surface)',
                  opacity: selectedIds.size === 0 ? 0.5 : 1,
                }}>
                  {t.plantsPage.bulkArchiveBtn(selectedIds.size)}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    )
  }

  // ───────────────────────── MOBILE LAYOUT ─────────────────────────
  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Browser chrome spacer — zorgt dat sticky header niet achter URL bar verdwijnt op mobiel */}
      <div style={{ height: 'max(env(safe-area-inset-top, 0px), 48px)' }} />
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
            {t.plantsPage.title}.
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              fontWeight: 400, color: 'var(--color-text-muted)',
              background: 'var(--color-surface)', padding: '2px 8px',
              borderRadius: 20, border: '1px solid var(--color-border)',
            }}>{filtered.length}</span>
          </h1>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {/* The photo round is a phone-in-the-garden activity, so it needs a
                door on the phone. Its first version only had one in the desktop
                header, which is the one place it is useless. */}
            <button onClick={() => navigate('/photo-round')} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: '50%',
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              cursor: 'pointer', flexShrink: 0, color: 'var(--color-text-soft)',
            }} aria-label={t.photoRound.startFromPlants} title={t.photoRound.startFromPlants}>
              <Glyph name="clipboard" size={16} aria-hidden />
            </button>
            <button onClick={() => navigate('/identify', { state: { mode: 'discover' } })} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: '50%',
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              cursor: 'pointer', flexShrink: 0, color: 'var(--color-text-soft)',
            }} aria-label={t.discovery.identifyWild}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </button>
            <button onClick={() => navigate('/plants/add')} style={{
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
              color: 'var(--color-surface)', background: 'var(--color-primary)',
              border: 'none', borderRadius: 100, padding: '6px 14px',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              {t.plantsPage.addButton}
            </button>
            <button
              onClick={() => isSelecting ? clearSelection() : setIsSelecting(true)}
              style={{
                fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
                color: isSelecting ? 'var(--color-primary)' : 'var(--color-text-soft)',
                background: isSelecting ? 'var(--color-bg-warm)' : 'transparent',
                border: '1px solid var(--color-border)', borderRadius: 100,
                padding: '6px 14px', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {isSelecting ? t.common.cancel : t.plantsPage.select}
            </button>
          </div>
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

        {/* Tab toggle — mobile */}
                <nav aria-label="Plant collection" style={{ padding: '4px 16px 8px', display: 'flex', justifyContent: 'center' }}>
                  <div style={{
                    display: 'flex', gap: 2, padding: 3, borderRadius: 100,
                    border: '1px solid var(--color-border)', background: 'var(--color-bg-warm)',
                  }}>
                    {(['plants', 'journal'] as const).map((tab) => {
                      const active = activeTab === tab
                      return (
                        <button key={tab} onClick={() => setActiveTab(tab)} style={{
                          fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: active ? 600 : 500,
                          padding: '8px 16px', borderRadius: 100, cursor: 'pointer', border: 'none',
                          background: active ? 'var(--color-primary)' : 'transparent',
                          color: active ? '#fff' : 'var(--color-text-soft)',
                          display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                        }}>
                          <Glyph name={tab === 'plants' ? 'sprout' : 'book'} size={15} strokeWidth={2} />
                          {tab === 'plants' ? t.discovery.myPlantsTab : t.discovery.journalTab}
                        </button>
                      )
                    })}
                  </div>
                </nav>

        {/* Filter bottom sheet (the trigger lives inline in ResultsBar) */}
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
                maxHeight: '88vh', overflowY: 'auto',
                animation: 'slide-up 0.25s ease-out',
              }}
            >
              {/* Drag handle */}
              <button
                onClick={() => setShowFilterSheet(false)}
                aria-label="Sluiten"
                style={{
                  display: 'block', margin: '12px auto 8px',
                  padding: '8px 24px', background: 'none', border: 'none',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: 40, height: 4,
                  background: 'var(--color-border)',
                  borderRadius: 999,
                }} />
              </button>
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
                    <FilterChip active={filterArea === 'all'} onClick={() => setFilterArea('all')}>
                      {t.plantsPage.filterAll}<Count>{plants.length}</Count>
                    </FilterChip>
                    <FilterChip active={filterArea === 'huis'} onClick={() => setFilterArea('huis')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Glyph name="home" size={15} strokeWidth={2} />
                        {t.plantsPage.filterHouse}<Count>{huisCount}</Count>
                      </span>
                    </FilterChip>
                    <FilterChip active={filterArea === 'tuin'} onClick={() => setFilterArea('tuin')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Glyph name="leaf" size={15} strokeWidth={2} />
                        {t.plantsPage.filterGarden}<Count>{tuinCount}</Count>
                      </span>
                    </FilterChip>
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
        {activeTab === 'journal' && (
          <Suspense fallback={<div style={{ padding: 24, color: 'var(--color-text-soft)' }}>...</div>}>
            <DiscoveriesSection />
          </Suspense>
        )}
        {activeTab === 'plants' && alertsOnly && (
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

        {activeTab === 'plants' && !isSelecting && <PlantFactCard />}
        {activeTab === 'plants' && <ResultsBar />}
        {activeTab === 'plants' && <LoadingSkeleton />}
        {activeTab === 'plants' && <EmptyState />}
        {activeTab === 'plants' && <PlantGrid />}
        {activeTab === 'plants' && !isSelecting && <RecentCareSection />}
      </div>
    </div>
  )

  // ─────────── Shared sub-components ───────────

  function ResultsBar() {
    return !isLoading && (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
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
        {isMobile ? (
          // Filter trigger sits beside the count on mobile (no longer floating
          // above the fun-fact card). Font tuned to sit level with the italic
          // count text next to it.
          <button
            onClick={() => setShowFilterSheet(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', borderRadius: 100,
              border: '1px solid var(--color-border)',
              background: hasActiveFilters ? 'var(--color-primary)' : 'transparent',
              color: hasActiveFilters ? 'var(--color-surface)' : 'var(--color-text-soft)',
              fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s ease',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
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
                {activeFilterCount}
              </span>
            )}
          </button>
        ) : (
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
      <div style={{
        position: 'relative', overflow: 'hidden', textAlign: 'center',
        padding: isMobile ? '40px 20px' : '80px 20px', minHeight: isMobile ? 260 : 340,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <PageDecor variant="sparse" />
        <p style={{
          position: 'relative',
          fontFamily: 'var(--font-heading)', fontStyle: 'italic',
          fontSize: isMobile ? 14 : 16, color: 'var(--color-text-soft)',
          margin: '0 0 6px',
        }}>
          {query ? t.plantsPage.emptySearch : t.plantsPage.emptyNoPlants}
        </p>
        <p style={{ position: 'relative', fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
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
          <PlantCard key={plant.id} plant={plant} iconMap={iconMap}
            isSelecting={isSelecting} selected={selectedIds.has(plant.id)} onToggle={() => toggleSelect(plant.id)} />
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

function PlantIconWell({ plant, altName }: { plant: Plant; altName: string }) {
  if (plant.icon_key) {
    return (
      <div style={{
        aspectRatio: '1',
        background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)',
        borderBottom: '1px solid var(--color-border-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16%', position: 'relative',
      }}>
        <img src={resolveIconUrl(plant.icon_key)!} alt={altName}
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

function PlantCard({ plant, iconMap, isSelecting, selected, onToggle }: {
  plant: Plant; iconMap: Map<string, PlantIcon>;
  isSelecting?: boolean; selected?: boolean; onToggle?: () => void;
}) {
  const CATEGORY_LABELS = useCategoryLabels()
  const FORM_LABELS = useFormLabels()
  const { updatePlant } = useFloreren()
  const t = useT()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(plant.name)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const displayName = plantDisplayName(plant, t.locale)
  const icon = plant.icon_key ? iconMap.get(plant.icon_key) : null
  const typeLabel = icon?.cat || plant.plant_type || null
  const typeDisplay = typeLabel ? stripLabelEmoji(CATEGORY_LABELS[typeLabel] || typeLabel) : null
  const formLabel = icon?.form || null
  const formDisplay = formLabel ? stripLabelEmoji(FORM_LABELS[formLabel] || formLabel) : null
  const familyName = icon?.family || null

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  useEffect(() => {
    if (!isEditing) setEditName(plant.name)
  }, [plant.name, isEditing])

  async function commitEdit() {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === plant.name) {
      setIsEditing(false)
      setEditName(plant.name)
      return
    }
    setSaving(true)
    try {
      await updatePlant(plant.id, { name: trimmed })
      setIsEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function startEdit(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setEditName(plant.name)
    setIsEditing(true)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
    if (e.key === 'Escape') { setIsEditing(false); setEditName(plant.name) }
  }

  const nameRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
      {isEditing ? (
        <input
          ref={inputRef}
          value={editName}
          onChange={e => setEditName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitEdit}
          disabled={saving}
          style={{
            flex: 1, minWidth: 0,
            fontFamily: 'var(--font-heading)', fontWeight: 500,
            fontSize: 14, lineHeight: 1.2, color: 'var(--color-text)',
            letterSpacing: '-0.01em', border: 'none', outline: 'none',
            background: 'transparent', padding: 0, margin: 0,
          }}
        />
      ) : (
        <>
          <h3 style={{
            margin: 0, flex: 1, fontFamily: 'var(--font-heading)', fontWeight: 500,
            fontSize: 14, lineHeight: 1.2, color: 'var(--color-text)',
            letterSpacing: '-0.01em', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {displayName}
          </h3>
          {!isSelecting && (
            <button
              onClick={startEdit}
              aria-label={t.plantsPage.renameHint}
              style={{
                flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
                padding: 2, color: 'var(--color-text-muted)', opacity: 0.5,
                display: 'flex', alignItems: 'center',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  )

  if (isSelecting) {
    return (
      <div onClick={onToggle}
        className="card card-glow block"
        style={{ borderRadius: 14, overflow: 'hidden', color: 'inherit', cursor: 'pointer',
          outline: selected ? '2px solid var(--color-primary)' : undefined,
          outlineOffset: selected ? -2 : undefined,
          transition: 'outline 0.15s, opacity 0.15s', opacity: selected ? 1 : 0.75,
        }}
      >
        <div style={{ position: 'relative' }}>
          <PlantIconWell plant={plant} altName={displayName} />
          <div style={{
            position: 'absolute', top: 6, right: 6,
            width: 22, height: 22, borderRadius: 22,
            border: selected ? 'none' : '2px solid var(--color-border)',
            background: selected ? 'var(--color-primary)' : 'rgba(251,247,238,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {selected && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-surface)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        </div>
        <div style={{ padding: '10px 12px 12px' }}>
          {nameRow}
          {plant.species && (
            <p style={{
              margin: '1px 0 0', fontFamily: 'var(--font-heading)', fontStyle: 'italic',
              fontSize: 11, color: 'var(--color-text-soft)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {plant.species}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <Link to={`/plants/${plant.id}`}
      className="card card-glow no-underline block"
      style={{ borderRadius: 14, overflow: 'hidden', color: 'inherit', textDecoration: 'none' }}
      onClick={isEditing ? e => e.preventDefault() : undefined}
    >
      <div style={{ position: 'relative' }}>
        <PlantIconWell plant={plant} altName={displayName} />
        {typeDisplay && (
          <span style={{
            position: 'absolute', top: 6, left: 6,
            fontFamily: 'var(--font-mono)', fontSize: 7, textTransform: 'uppercase',
            letterSpacing: '0.1em', color: 'var(--color-text-muted)',
            background: 'rgba(251,247,238,0.92)', padding: '2px 6px',
            borderRadius: 4, border: '1px solid var(--color-border-soft)',
          }}>
            {typeDisplay}
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
            {formDisplay}
          </span>
        )}
      </div>
      <div style={{ padding: '10px 12px 12px' }}>
        {nameRow}
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
