import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { CARE_TYPE_INFO } from '../types'
import type { CareTask, RecentLogEntry, MapInfo, PlantFactOut } from '../types'
import type { WeatherData, WeatherIcon } from '../hooks/useWeather'
import { useWeather } from '../hooks/useWeather'
import UserSwitcher from '../components/UserSwitcher'
import { HALO_COLORS } from '../hooks/usePlantStatus'
import { useT } from '../context/LanguageContext'
import { getToken } from '../api/auth'
import type { Translations } from '../i18n/translations'
import PageDecor from '../components/PageDecor'
import WelcomeChecklist from '../components/WelcomeChecklist'

const PX_PER_M = 46

function parseMapDimensions(viewbox: string): { w: number; h: number } | null {
  const parts = viewbox.trim().split(/\s+/).map(Number)
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null
  const [, , wPx, hPx] = parts
  if (wPx <= 0 || hPx <= 0) return null
  return { w: Math.round(wPx / PX_PER_M), h: Math.round(hPx / PX_PER_M) }
}

const WEEKLY_BUDGET: Record<string, number> = {
  winter: 5, spring: 18, summer: 25, autumn: 10,
}
function dailyWaterNeedMm(): number {
  const m = new Date().getMonth() // 0=Jan
  const season = m < 2 || m === 11 ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'autumn'
  return WEEKLY_BUDGET[season] / 7
}

const RAIN_OK = 'var(--color-primary)'   // green
const RAIN_DRY = 'var(--color-overdue)'  // red

export default function Dashboard() {
  const { dashboardV2, activeUserId, users, maps, plants, loadDashboardV2, loadPlants, isLoading, createMap } = useFloreren()
  const activeUser = users.find((u) => u.id === activeUserId)
  const t = useT()
  const navigate = useNavigate()

  const [showNewMap, setShowNewMap] = useState(false)
  const [newMapName, setNewMapName] = useState('')
  const [newMapType, setNewMapType] = useState<'outdoor' | 'indoor'>('outdoor')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function handleCreateMap() {
    if (!newMapName.trim() || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const map = await createMap({ name: newMapName.trim(), map_type: newMapType })
      setShowNewMap(false)
      setNewMapName('')
      setNewMapType('outdoor')
      navigate(`/maps/${map.id}/edit-layout`)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : t.maps.failedCreate)
    } finally {
      setCreating(false)
    }
  }

  function openNewMap() {
    setNewMapName('')
    setNewMapType('outdoor')
    setCreateError(null)
    setShowNewMap(true)
  }

  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 6) return t.dashboard.greeting.night
    if (hour < 12) return t.dashboard.greeting.morning
    if (hour < 18) return t.dashboard.greeting.afternoon
    return t.dashboard.greeting.evening
  })()

  const outdoorMap = maps.find((m) => m.map_type === 'outdoor')
  const { weather } = useWeather(outdoorMap?.lat ?? null, outdoorMap?.lon ?? null)

  useEffect(() => {
    if (getToken()) { loadDashboardV2(); loadPlants() }
  }, [loadDashboardV2, loadPlants])

  const overdueCount = dashboardV2?.overdue.length ?? 0
  const dueTodayCount = dashboardV2?.due_today.length ?? 0
  const upcomingCount = dashboardV2?.upcoming.length ?? 0
  const totalTasks = overdueCount + dueTodayCount + upcomingCount
  const nextCareTask = dashboardV2?.overdue[0] ?? dashboardV2?.due_today[0] ?? null

  const date = new Date().toLocaleDateString(t.locale, { weekday: 'long', day: 'numeric', month: 'long' })

  function leadCopy(overdue: number, due: number): string {
    if (overdue > 0) return `${overdue} ${overdue === 1 ? 'plant' : t.dashboard.status.collection.toLowerCase()} ${t.dashboard.tasks.overdue.toLowerCase()}.`
    if (due > 0) return t.dashboard.tasks.calm
    return t.dashboard.tasks.calm
  }

  function summaryLede(overdue: number, due: number, upcoming: number): string {
    const parts: string[] = []
    if (overdue > 0) parts.push(`${overdue} ${t.dashboard.tasks.overdue.toLowerCase()}`)
    if (due > 0) parts.push(`${due} ${t.dashboard.tasks.today.toLowerCase()}`)
    if (upcoming > 0) parts.push(`${upcoming} ${t.dashboard.tasks.upcoming.toLowerCase()}`)
    return parts.join(' · ')
  }

  return (
    <div style={{ paddingBottom: 80, position: 'relative', overflow: 'hidden' }}>
      <PageDecor />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Header ── */}
        <DashboardHeader
          t={t}
          greeting={greeting}
          userName={activeUser?.name ?? '…'}
          date={date}
          lede={leadCopy(overdueCount, dueTodayCount)}
          weather={weather}
          nextCareTask={nextCareTask}
        />

        {/* ── Status Banner ── */}
        {dashboardV2 && (
          <StatusBanner t={t} counts={dashboardV2.status_counts} />
        )}

        {/* ── Onboarding Checklist ── */}
        <WelcomeChecklist
          hasMap={maps.length > 0}
          hasPlant={plants.length > 0}
          accountId={activeUserId ?? 0}
          onCreateMap={openNewMap}
        />

        {/* ── Responsive grid: main + sidebar ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 0,
        }}
          className="dashboard-grid"
        >
          {/* MAIN column */}
          <div>
            {/* Mijn Tuinen */}
            <section className="dash-section-hpad" style={{ padding: '0 24px' }}>
              <SectionHeader
                leftLede={maps.length === 0 ? t.dashboard.actions.addGarden : maps.length === 1 ? t.dashboard.actions.view : `${t.dashboard.actions.view} (${maps.length})`}
                rightMarker={t.dashboard.sections.myGardens}
              />
              {maps.length > 0 ? (
                <div className="no-scrollbar dash-map-scroll" style={{ display: 'flex', overflowX: 'auto', gap: 14, margin: '0 -24px', padding: '4px 24px 16px' }}>
                  {maps.map((map) => <MapCard key={map.id} map={map} t={t} />)}
                  <NewMapCard t={t} onNewMap={openNewMap} />
                </div>
              ) : (
                <button onClick={openNewMap} style={{
                  display: 'flex', width: '100%', height: 132,
                  border: '1px dashed var(--color-border)', borderRadius: 14,
                  flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-text-muted)', background: 'var(--color-surface)',
                  cursor: 'pointer', marginBottom: 18,
                }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--color-primary)' }}>+</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: 6 }}>{t.dashboard.actions.addGarden}</span>
                </button>
              )}
            </section>

            {/* Vandaag */}
            <section className="dash-section-hpad" style={{ padding: '0 24px' }}>
              <SectionHeader
                leftLede={summaryLede(overdueCount, dueTodayCount, upcomingCount)}
                rightMarker={t.dashboard.sections.today}
              />
              {isLoading && <TaskSkeletons />}
              {!isLoading && totalTasks === 0 && <CalmEmptyState t={t} />}
              {!isLoading && dashboardV2 && totalTasks > 0 && (
                <TodayGrid
                  t={t}
                  overdue={dashboardV2.overdue}
                  dueToday={dashboardV2.due_today}
                />
              )}
            </section>

            {/* Logboek */}
            {dashboardV2 && dashboardV2.recent_log.length > 0 && (
              <section className="dash-section-hpad" style={{ padding: '0 24px' }}>
                <SectionHeader leftLede="" rightMarker={t.dashboard.sections.logbook} />
                <LogboekSection t={t} entries={dashboardV2.recent_log} />
              </section>
            )}
          </div>

          {/* SIDEBAR column */}
          <div className="dash-section-hpad dashboard-sidebar" style={{ padding: '0 24px' }}>
            <WeatherCard t={t} weather={weather} />
            {dashboardV2?.plant_fact && (
              <CareTipCard t={t} fact={dashboardV2.plant_fact} />
            )}
            <Link to="/weeds/identify" style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{
                borderRadius: 14, overflow: 'hidden', marginBottom: 18,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                padding: '18px 18px',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 18, color: 'var(--color-text)', marginBottom: 4 }}>
                  🌿 {t.weeds.identifyCard.title}
                </div>
                <p style={{ margin: 0, fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {t.weeds.identifyCard.subtitle}
                </p>
              </div>
            </Link>
            <Link to="/identify" style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{
                borderRadius: 14, overflow: 'hidden', marginBottom: 18,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                padding: '18px 18px',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 18, color: 'var(--color-text)', marginBottom: 4 }}>
                  📷 Foto-identificatie
                </div>
                <p style={{ margin: 0, fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  Richt de camera op een plant om hem te identificeren.
                </p>
              </div>
            </Link>
          </div>
        </div>

      </div>

      <style>{`
        @media (min-width: 900px) {
          .dashboard-grid {
            grid-template-columns: 1fr 340px !important;
            align-items: start;
            padding: 0 24px;
            gap: 28px;
          }
          .dashboard-sidebar {
            padding: 0 !important;
          }
        }
      `}</style>

      {showNewMap && (
        <div
          onClick={() => setShowNewMap(false)}
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
              background: 'var(--color-surface)',
              borderRadius: 16,
              padding: '28px 24px 24px',
              width: '100%',
              maxWidth: 400,
              border: '1px solid var(--color-border)',
            }}
          >
            <h2 style={{
              margin: '0 0 20px',
              fontFamily: 'var(--font-heading)',
              fontWeight: 500,
              fontSize: 22,
              color: 'var(--color-text)',
              letterSpacing: '-0.01em',
            }}>{t.dashboard.actions.newGarden}</h2>

            {createError && (
              <div style={{
                background: 'var(--color-overdue-soft, rgba(200,60,60,.1))',
                color: 'var(--color-overdue)',
                fontSize: 13, borderRadius: 8, padding: '8px 12px', marginBottom: 16,
              }}>{createError}</div>
            )}

            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-text-muted)', marginBottom: 6 }}>
              {t.maps.mapNameLabel}
            </label>
            <input
              autoFocus
              value={newMapName}
              onChange={(e) => setNewMapName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateMap()}
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
                  onClick={() => setNewMapType(type)}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14,
                    fontFamily: 'var(--font-body)', fontWeight: 500, cursor: 'pointer',
                    border: `1px solid ${newMapType === type ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: newMapType === type ? 'var(--color-primary)' : 'var(--color-bg)',
                    color: newMapType === type ? '#fff' : 'var(--color-text-muted)',
                    transition: 'all 0.12s',
                  }}
                >
                  {type === 'outdoor' ? t.maps.outdoor : t.maps.indoor}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleCreateMap}
                disabled={!newMapName.trim() || creating}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 10,
                  background: 'var(--color-primary)', color: '#fff',
                  fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
                  border: 'none', cursor: 'pointer', opacity: (!newMapName.trim() || creating) ? 0.5 : 1,
                  transition: 'opacity 0.12s',
                }}
              >
                {creating ? '…' : t.maps.newMap.replace('+ ', '')}
              </button>
              <button
                onClick={() => setShowNewMap(false)}
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
      )}
    </div>
  )
}

// ── Helper components ──

function DashboardHeader({
  t, greeting, userName, date, lede, weather, nextCareTask,
}: {
  t: Translations
  greeting: string
  userName: string
  date: string
  lede: string
  weather: WeatherData | null
  nextCareTask: CareTask | null
}) {
  const sunrise = weather ? new Date(weather.sunrise).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' }) : '—'
  const sunset  = weather ? new Date(weather.sunset).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' }) : '—'
  const temp    = weather ? `${weather.currentTemp}°C` : '—'
  const nextCare = nextCareTask
    ? `${nextCareTask.plant_name}${nextCareTask.days_overdue > 0 ? ` · ${t.dashboard.tasks.daysLate(nextCareTask.days_overdue)}` : ` · ${t.dashboard.tasks.today}`}`
    : t.dashboard.almanac.onTrack

  return (
    <header style={{
      padding: '40px 24px 20px',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      flexWrap: 'wrap',
      gap: 20,
    }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        {/* Eyebrow */}
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em',
          textTransform: 'uppercase', color: 'var(--color-text-muted)',
          margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ width: 24, height: 1, background: 'var(--color-border)', flex: 'none' }} />
          {greeting} · {date}
          <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        </p>

        {/* H1 */}
        <h1 style={{
          fontFamily: 'var(--font-heading)', fontWeight: 500,
          fontSize: 'clamp(36px, 5vw, 56px)', lineHeight: 0.95,
          letterSpacing: '-0.02em', color: 'var(--color-text)', margin: 0,
        }}>
          {greeting},{' '}
          <em style={{ fontStyle: 'italic', color: 'var(--color-primary)', fontWeight: 400 }}>
            {userName}
          </em>.
        </h1>

        {/* Lede */}
        <p style={{
          fontFamily: 'var(--font-heading)', fontStyle: 'italic',
          fontSize: 15, lineHeight: 1.5, color: 'var(--color-text-soft)',
          maxWidth: 440, margin: '8px 0 16px 0',
        }}>
          {lede}
        </p>

        {/* Almanac 2×2 grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden',
          maxWidth: 440,
        }}>
          {[
            { label: t.dashboard.almanac.sunrise, value: sunrise },
            { label: t.dashboard.almanac.sunset, value: sunset },
            { label: t.dashboard.almanac.temp, value: temp },
            { label: t.dashboard.almanac.nextCare, value: nextCare },
          ].map((row, i) => (
            <div key={row.label} style={{
              padding: '10px 14px',
              borderRight: i % 2 === 0 ? '1px solid var(--color-border)' : 'none',
              borderBottom: i < 2 ? '1px solid var(--color-border)' : 'none',
              background: 'var(--color-surface)',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                textTransform: 'uppercase', letterSpacing: '0.18em',
                color: 'var(--color-text-muted)', marginBottom: 3,
              }}>{row.label}</div>
              <div style={{
                fontFamily: 'var(--font-heading)', fontSize: 14,
                color: i === 2 ? 'var(--color-overdue)' : 'var(--color-text)',
                fontWeight: 500,
              }}>{row.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 16, paddingTop: 4 }}>
        <UserSwitcher />
      </div>
    </header>
  )
}

function StatusBanner({ t, counts }: { t: Translations; counts: { total: number; on_schedule: number; thirsty: number; dry: number } }) {
  const cells = [
    { label: t.dashboard.status.collection, value: counts.total, color: 'var(--color-text)' },
    { label: t.dashboard.status.onSchedule, value: counts.on_schedule, color: 'var(--color-primary)' },
    { label: t.dashboard.status.thirsty, value: counts.thirsty, color: counts.thirsty > 0 ? 'var(--color-due)' : 'var(--color-text-muted)' },
    { label: t.dashboard.status.dry, value: counts.dry, color: counts.dry > 0 ? 'var(--color-overdue)' : 'var(--color-text-muted)' },
  ]
  return (
    <div className="status-banner" style={{
      display: 'grid', gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
      border: '1px solid var(--color-border)',
      borderLeft: 'none', borderRight: 'none',
      background: 'var(--color-surface)',
      margin: '0 0 20px',
    }}>
      {cells.map((cell, i) => (
        <div key={cell.label} style={{
          padding: '14px 16px', textAlign: 'center',
          borderRight: i < cells.length - 1 ? '1px solid var(--color-border-soft)' : 'none',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            textTransform: 'uppercase', letterSpacing: '0.18em',
            color: 'var(--color-text-muted)', marginBottom: 5,
          }}>{cell.label}</div>
          <div style={{
            fontFamily: 'var(--font-heading)', fontSize: 28,
            fontWeight: 500, lineHeight: 1, color: cell.color,
          }}>{cell.value}</div>
        </div>
      ))}
    </div>
  )
}


function SectionHeader({
  leftLede,
  rightMarker,
  rightAction,
}: {
  leftLede: string
  rightMarker: string
  rightAction?: { to: string; label: string }
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      padding: '20px 0 18px',
      borderBottom: '1px solid var(--color-border)',
      marginBottom: 18,
      gap: 12,
    }}>
      <p style={{
        margin: 0,
        fontFamily: 'var(--font-heading)',
        fontStyle: 'italic',
        fontSize: 15,
        color: 'var(--color-text-soft)',
        flex: 1,
        minWidth: 0,
      }}>
        {leftLede}
      </p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexShrink: 0 }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          color: 'var(--color-text-muted)',
        }}>{rightMarker}</span>
        {rightAction && (
          <Link to={rightAction.to} style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: 'var(--color-primary)',
            textDecoration: 'none',
          }}>{rightAction.label}</Link>
        )}
      </div>
    </div>
  )
}

function MapCard({ map, t }: { map: MapInfo; t: Translations }) {
  const typeLabel = map.map_type === 'outdoor' ? t.dashboard.actions.mapTypeOutdoor : t.dashboard.actions.mapTypeIndoor
  const dims = parseMapDimensions(map.viewbox)
  const subLine = dims ? `${typeLabel} · ${dims.w} m × ${dims.h} m` : typeLabel
  return (
    <div
      className="card dash-map-card"
      style={{
        flexShrink: 0,
        width: 300,
        borderRadius: 14,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Thumbnail — click to view */}
      <Link
        to={`/map/${map.slug}`}
        style={{ display: 'block', textDecoration: 'none', color: 'inherit', position: 'relative' }}
      >
        <div style={{
          aspectRatio: '4 / 3',
          background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: map.thumbnail_file ? '6%' : '14%',
        }}>
          <img
            src={map.thumbnail_file ?? map.svg_file ?? ''}
            alt={map.name}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
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
      </Link>

      {/* Name + dimensions */}
      <div style={{ padding: '12px 14px 10px', borderTop: '1px solid var(--color-border-soft)' }}>
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
          {map.name}
        </h3>
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
          {subLine}
        </p>
      </div>

      {/* Action bar */}
      <div style={{
        display: 'flex',
        borderTop: '1px solid var(--color-border-soft)',
        marginTop: 'auto',
      }}>
        <Link
          to={`/map/${map.slug}`}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '9px 0',
            fontFamily: 'var(--font-heading)',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--color-primary)',
            textDecoration: 'none',
            borderRight: '1px solid var(--color-border-soft)',
          }}
        >
          {t.dashboard.actions.view}
        </Link>
        <Link
          to={`/maps/${map.id}/edit-layout`}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '9px 0',
            fontFamily: 'var(--font-heading)',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--color-text-soft)',
            textDecoration: 'none',
            borderRight: '1px solid var(--color-border-soft)',
          }}
        >
          {t.dashboard.actions.edit}
        </Link>
        <Link
          to={`/maps/${map.id}/settings`}
          title={t.mapSettings.pageTitle}
          style={{
            padding: '9px 14px',
            fontFamily: 'var(--font-heading)',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--color-text-soft)',
            textDecoration: 'none',
          }}
        >
          ⚙
        </Link>
      </div>
    </div>
  )
}

function NewMapCard({ t, onNewMap }: { t: Translations; onNewMap: () => void }) {
  return (
    <button
      onClick={onNewMap}
      style={{
        flexShrink: 0,
        width: 300,
        borderRadius: 14,
        border: '1px dashed var(--color-border)',
        background: 'var(--color-surface)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-muted)',
        cursor: 'pointer',
        aspectRatio: '4 / 3',
      }}
    >
      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--color-primary)' }}>+</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: 6 }}>{t.dashboard.actions.newGarden}</span>
    </button>
  )
}

function TaskGroup({ label, tone, tasks }: { label: string; tone: 'overdue' | 'due' | 'upcoming'; tasks: CareTask[] }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        textTransform: 'uppercase',
        letterSpacing: '0.2em',
        color: 'var(--color-text-muted)',
        margin: '0 0 10px',
      }}>
        {label}
        <span style={{ opacity: 0.65, marginLeft: 6 }}>{tasks.length}</span>
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tasks.map((task) => <TaskCard key={task.schedule_id} task={task} tone={tone} />)}
      </div>
    </div>
  )
}

function TaskCard({ task, tone }: { task: CareTask; tone: 'overdue' | 'due' | 'upcoming' }) {
  const markCareDone = useFloreren((s) => s.markCareDone)
  const t = useT()
  const careLabel = t.care[task.care_type as keyof typeof t.care] ?? CARE_TYPE_INFO[task.care_type as keyof typeof CARE_TYPE_INFO]?.label ?? task.care_type

  const accentColor =
    tone === 'overdue' ? 'var(--color-overdue)' :
    tone === 'due' ? 'var(--color-due)' :
    'var(--color-border)'

  const taskHaloColor: string | null =
    task.care_type === 'water' && task.days_overdue >= 0 ? HALO_COLORS.needs_care :
    null

  return (
    <div className="card" style={{
      borderRadius: 14,
      padding: '14px 16px',
      borderLeft: `3px solid ${accentColor}`,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
    }}>
      {/* Thumbnail with optional halo */}
      <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
        {taskHaloColor && (
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 10,
            background: `radial-gradient(circle, ${taskHaloColor} 0%, transparent 70%)`,
            opacity: 0.5,
            pointerEvents: 'none',
          }} />
        )}
        {task.plant_photo ? (
          <img src={task.plant_photo} alt="" style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            objectFit: 'cover',
            display: 'block',
            position: 'relative',
          }} />
        ) : (
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)',
            border: '1px solid var(--color-border-soft)',
          }} />
        )}
      </div>

      <Link to={`/plants/${task.plant_id}`} style={{
        flex: 1,
        minWidth: 0,
        textDecoration: 'none',
        color: 'inherit',
      }}>
        <p style={{
          margin: 0,
          fontFamily: 'var(--font-heading)',
          fontWeight: 500,
          fontSize: 16,
          color: 'var(--color-text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>{task.plant_name}</p>
        <p style={{
          margin: '4px 0 0',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          color: 'var(--color-text-muted)',
        }}>
          {careLabel}{task.location ? ` · ${task.location}` : ''}
        </p>
        {tone === 'overdue' && (
          <p style={{
            margin: '4px 0 0',
            fontFamily: 'var(--font-heading)',
            fontStyle: 'italic',
            fontSize: 12,
            color: 'var(--color-overdue)',
          }}>
            {t.dashboard.tasks.daysLate(task.days_overdue)}
          </p>
        )}
        {tone === 'upcoming' && task.days_overdue < 0 && (
          <p style={{
            margin: '4px 0 0',
            fontFamily: 'var(--font-heading)',
            fontStyle: 'italic',
            fontSize: 12,
            color: 'var(--color-text-muted)',
          }}>
            {t.dashboard.tasks.inDays(-task.days_overdue)}
          </p>
        )}
      </Link>

      {tone !== 'upcoming' && (
        <button
          onClick={() => markCareDone(task.plant_id, task.care_type)}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--color-primary)',
            border: '1px solid var(--color-primary)',
            borderRadius: 100,
            background: 'transparent',
            padding: '8px 14px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-surface)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-primary)' }}
        >
          {t.dashboard.actions.done}
        </button>
      )}
    </div>
  )
}

function TaskSkeletons() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="card" style={{ borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 10 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 10, width: '40%' }} />
          </div>
          <div className="skeleton" style={{ width: 70, height: 32, borderRadius: 100 }} />
        </div>
      ))}
    </div>
  )
}

function CalmEmptyState({ t }: { t: Translations }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p style={{
        fontFamily: 'var(--font-heading)',
        fontStyle: 'italic',
        fontSize: 18,
        color: 'var(--color-text-soft)',
        margin: '0 0 8px',
      }}>
        {t.dashboard.tasks.calm}
      </p>
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.2em',
        color: 'var(--color-text-muted)',
        margin: 0,
      }}>
        {t.dashboard.tasks.noTasks}
      </p>
    </div>
  )
}

function classifyTaskLocation(task: CareTask): 'buiten' | 'binnen' {
  if (task.location === 'Tuin') return 'buiten'
  if (task.location === 'Huis') return 'binnen'
  if (task.map_type === 'outdoor') return 'buiten'
  if (task.map_type === 'indoor') return 'binnen'
  return 'buiten'
}

// Location group icons (labels are provided from t in TodayGrid)
const LOCATION_ICON = {
  buiten: '🌿',
  binnen: '🏠',
} as const

function LocationGroup({
  label,
  icon,
  tasks,
  tone,
  t,
}: {
  label: string
  icon: string
  tasks: CareTask[]
  tone: 'overdue' | 'due' | 'upcoming'
  t: Translations
}) {
  const [open, setOpen] = useState(tasks.length > 0)

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', padding: '8px 14px',
          border: 'none', borderBottom: '1px solid var(--color-border-soft)',
          background: 'var(--color-surface)',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 15, width: 22, textAlign: 'center' }}>{icon}</span>
        <span style={{
          fontFamily: 'var(--font-heading)',
          fontStyle: 'italic',
          fontSize: 13,
          color: 'var(--color-text-soft)',
          flex: 1,
          textAlign: 'left',
        }}>{label}</span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--color-text-muted)',
        }}>{tasks.length}</span>
        <span style={{
          fontSize: 9,
          color: 'var(--color-text-muted)',
          transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.15s',
        }}>▶</span>
      </button>
      {open && (
        tasks.length === 0 ? (
          <div style={{ padding: '14px 16px', textAlign: 'center' }}>
            <span style={{
              fontFamily: 'var(--font-heading)', fontStyle: 'italic',
              fontSize: 12, color: 'var(--color-text-muted)',
            }}>{t.dashboard.almanac.onTrack}</span>
          </div>
        ) : (
          tasks.map(task => <TodayTaskRow key={task.schedule_id} task={task} t={t} />)
        )
      )}
    </div>
  )
}

function TodayGrid({ overdue, dueToday, t }: { overdue: CareTask[]; dueToday: CareTask[]; t: Translations }) {
  const allDue = [...overdue, ...dueToday]
  const waterFeedTypes = new Set(['water', 'fertilize'])
  const waterFeedTasks = allDue.filter(task => waterFeedTypes.has(task.care_type))
  const attnTasks  = allDue.filter(task => !waterFeedTypes.has(task.care_type))

  function groupByLocation(tasks: CareTask[]) {
    const buiten = tasks.filter(task => classifyTaskLocation(task) === 'buiten')
    const binnen  = tasks.filter(task => classifyTaskLocation(task) === 'binnen')
    return { buiten, binnen }
  }

  const waterFeedGroups = groupByLocation(waterFeedTasks)
  const attnGroups  = groupByLocation(attnTasks)

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      border: '1px solid var(--color-border)', borderRadius: 14,
      overflow: 'hidden', marginBottom: 24,
    }}>
      {/* Column headers */}
      <TodayColHead label={t.dashboard.tasks.waterFeed} count={waterFeedTasks.length} pip="overdue" />
      <TodayColHead label={t.dashboard.tasks.attention} count={attnTasks.length} pip="due" borderLeft />

      {/* Water & Voeding column */}
      <div style={{ borderRight: '1px solid var(--color-border-soft)' }}>
        {waterFeedTasks.length === 0 ? <EmptyCol t={t} /> : (
          <>
            <LocationGroup label={t.dashboard.actions.mapTypeOutdoor} icon={LOCATION_ICON.buiten} tasks={waterFeedGroups.buiten} tone="due" t={t} />
            <LocationGroup label={t.dashboard.actions.mapTypeIndoor} icon={LOCATION_ICON.binnen} tasks={waterFeedGroups.binnen} tone="due" t={t} />
          </>
        )}
      </div>

      {/* Aandacht column */}
      <div>
        {attnTasks.length === 0 ? <EmptyCol t={t} /> : (
          <>
            <LocationGroup label={t.dashboard.actions.mapTypeOutdoor} icon={LOCATION_ICON.buiten} tasks={attnGroups.buiten} tone="due" t={t} />
            <LocationGroup label={t.dashboard.actions.mapTypeIndoor} icon={LOCATION_ICON.binnen} tasks={attnGroups.binnen} tone="due" t={t} />
          </>
        )}
      </div>
    </div>
  )
}

function TodayColHead({ label, count, pip, borderLeft }: { label: string; count: number; pip: 'overdue' | 'due'; borderLeft?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '12px 16px 10px',
      borderBottom: '1px solid var(--color-border-soft)',
      borderLeft: borderLeft ? '1px solid var(--color-border-soft)' : 'none',
      fontFamily: 'var(--font-mono)', fontSize: 10,
      textTransform: 'uppercase', letterSpacing: '0.18em',
      color: 'var(--color-text-muted)',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: pip === 'overdue' ? 'var(--color-overdue)' : 'var(--color-due)',
      }} />
      {label}
      <span style={{
        marginLeft: 'auto', fontFamily: 'var(--font-heading)',
        fontStyle: 'italic', fontSize: 14, color: 'var(--color-text-soft)',
        textTransform: 'none', letterSpacing: 0,
      }}>{count}</span>
    </div>
  )
}

function EmptyCol({ t }: { t: Translations }) {
  return (
    <div style={{ padding: '20px 16px', textAlign: 'center' }}>
      <span style={{
        fontFamily: 'var(--font-heading)', fontStyle: 'italic',
        fontSize: 13, color: 'var(--color-text-muted)',
      }}>{t.dashboard.almanac.onTrack}</span>
    </div>
  )
}

function TodayTaskRow({ task, t }: { task: CareTask; t: Translations }) {
  const markCareDone = useFloreren(s => s.markCareDone)
  const careLabel = t.care[task.care_type as keyof typeof t.care] ?? task.care_type
  const isOverdue = task.days_overdue > 0

  const taskHaloColor: string | null =
    task.care_type === 'water' && task.days_overdue >= 0 ? HALO_COLORS.needs_care :
    null

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '44px 1fr auto',
      gap: 10, alignItems: 'center',
      padding: '12px 14px',
      borderBottom: '1px dashed var(--color-border-soft)',
    }}>
      {/* Icon */}
      <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
        {taskHaloColor && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 10,
            background: `radial-gradient(circle, ${taskHaloColor} 0%, transparent 70%)`,
            opacity: 0.5, pointerEvents: 'none',
          }} />
        )}
        {task.plant_photo ? (
          <img src={task.plant_photo} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', display: 'block', position: 'relative' }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)', border: '1px solid var(--color-border-soft)' }} />
        )}
      </div>

      {/* Meta */}
      <Link to={`/plants/${task.plant_id}`} style={{ minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
        <p style={{
          margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 14,
          color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{task.plant_name}</p>
        <p style={{
          margin: '2px 0 0', fontFamily: 'var(--font-mono)', fontSize: 8,
          textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-text-muted)',
        }}>
          {task.is_ephemeral && (task.care_type === 'protect_cold' ? '❄️ ' : '🌡️ ')}
          {careLabel}{task.location ? ` · ${task.location}` : ''}
        </p>
        {isOverdue && (
          <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 11, color: 'var(--color-overdue)' }}>
            {t.dashboard.tasks.daysLate(task.days_overdue)}
          </p>
        )}
        {!isOverdue && (
          <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 11, color: 'var(--color-due)' }}>
            {t.dashboard.tasks.today}
          </p>
        )}
      </Link>

      {/* Done button */}
      <button
        onClick={() => markCareDone(task.plant_id, task.care_type)}
        style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500,
          color: 'var(--color-primary)', border: '1px solid var(--color-primary)',
          borderRadius: 100, background: 'transparent', padding: '6px 10px',
          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-surface)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-primary)' }}
      >{t.dashboard.actions.done}</button>
    </div>
  )
}

const LOG_TAG: Record<string, { color: string; bg: string; border: string }> = {
  water:       { color: 'var(--color-primary)',    bg: 'rgba(47,93,58,.08)',      border: 'rgba(47,93,58,.2)' },
  fertilize:   { color: 'var(--color-primary)',    bg: 'rgba(47,93,58,.08)',      border: 'rgba(47,93,58,.2)' },
  repot_check: { color: 'var(--color-text-soft)',  bg: 'rgba(74,90,71,.06)',      border: 'var(--color-border)' },
  prune:       { color: 'var(--color-text-soft)',  bg: 'rgba(74,90,71,.06)',      border: 'var(--color-border)' },
  mist:        { color: 'var(--color-primary)',    bg: 'rgba(47,93,58,.08)',      border: 'rgba(47,93,58,.2)' },
  rotate:      { color: 'var(--color-text-muted)', bg: 'rgba(138,148,130,.08)',  border: 'var(--color-border-soft)' },
}

function LogboekSection({ entries, t }: { entries: RecentLogEntry[]; t: Translations }) {
  return (
    <div className="card" style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
      {entries.map((entry, i) => {
        const tag = LOG_TAG[entry.care_type] ?? LOG_TAG.water
        const dateStr = new Date(entry.done_at).toLocaleDateString(t.locale, { day: 'numeric', month: 'long' })
        const timeStr = new Date(entry.done_at).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' })
        const actionLabel = t.care[entry.care_type as keyof typeof t.care] ?? entry.care_type

        return (
          <div key={entry.id} className="log-entry" style={{
            display: 'grid', gridTemplateColumns: '56px 1fr auto',
            gap: 14, padding: '16px 18px', alignItems: 'flex-start',
            borderTop: i > 0 ? '1px solid var(--color-border-soft)' : 'none',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 8,
              background: 'linear-gradient(145deg, #FDFAF1, #EDE5D1)',
              border: '1px solid var(--color-border-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', flexShrink: 0,
            }}>
              {entry.icon_key ? (
                <img src={`/icons/${entry.icon_key}.svg`} alt="" style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
              ) : (
                <span style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 11, color: 'var(--color-text-muted)' }}>🌿</span>
              )}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-text-muted)', marginBottom: 3 }}>
                {dateStr} · {timeStr}
              </div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, color: 'var(--color-text)', marginBottom: 2 }}>
                {actionLabel} · <em style={{ color: 'var(--color-primary)' }}>{entry.plant_name}</em>
              </div>
              {entry.notes && (
                <p style={{
                  margin: 0, fontFamily: 'var(--font-heading)', fontStyle: 'italic',
                  fontSize: 12, color: 'var(--color-text-soft)', lineHeight: 1.45,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>{entry.notes}</p>
              )}
            </div>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase',
              letterSpacing: '0.15em', color: tag.color, background: tag.bg,
              padding: '3px 8px', borderRadius: 99, border: `1px solid ${tag.border}`,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>{actionLabel}</span>
          </div>
        )
      })}
      <div style={{
        borderTop: '1px solid var(--color-border-soft)', padding: '12px 18px',
        display: 'flex', justifyContent: 'flex-end',
      }}>
        <Link to="/plants" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-primary)', textDecoration: 'none' }}>
          {t.dashboard.actions.fullLog}
        </Link>
      </div>
    </div>
  )
}

function WeatherIcon({ icon, size = 22 }: { icon: WeatherIcon; size?: number }) {
  if (icon === 'sun') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#D9A418" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" fill="#F4C542" stroke="none"/>
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>
    </svg>
  )
  if (icon === 'snow') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6B8FCA" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19" opacity=".5"/>
      <circle cx="12" cy="12" r="2" fill="#6B8FCA" stroke="none"/>
    </svg>
  )
  if (icon === 'rain' || icon === 'thunder') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6B8FCA" strokeWidth="1.6" strokeLinecap="round">
      <path d="M6 14a4 4 0 1 1 1-7.9A5 5 0 0 1 17 7a4 4 0 0 1 0 8H6z" fill="#C5D4ED" stroke="#6B8FCA"/>
      <path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>
    </svg>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#8A9482" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="9" cy="10" r="3" fill="#F4C542" stroke="#D9A418"/>
      <path d="M8 16a4 4 0 1 1 1-7.9A5 5 0 0 1 19 9a4 4 0 0 1 0 8H8z" fill="#E8E0CC" stroke="#8A9482"/>
    </svg>
  )
}

function WeatherCard({ weather, t }: { weather: WeatherData | null; t: Translations }) {
  return (
    <div className="card weather-card" style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
      <div className="weather-card-header" style={{ padding: '16px 18px 6px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--color-primary)', marginBottom: 4 }}>{t.dashboard.sections.weather}</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 22, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
          {weather ? (
            <><em style={{ color: 'var(--color-overdue)', fontStyle: 'italic', fontWeight: 400 }}>{weather.currentTemp}°</em> — {weather.currentConditionNl}.<br />
            <span style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 14, color: 'var(--color-text-soft)', fontWeight: 400 }}>
              {t.dashboard.weather.tonight}: {weather.tonightMin}°
            </span></>
          ) : t.dashboard.weather.loading}
        </div>
      </div>
      {weather && (
        <>
          <div className="weather-stats" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '1px solid var(--color-border-soft)', borderBottom: '1px solid var(--color-border-soft)' }}>
            {(() => {
              const need = dailyWaterNeedMm()
              const rainOk = weather.todayRainMm >= need
              const cells = [
                { v: `${weather.currentHumidity}%`, l: t.dashboard.weather.humidity, color: 'var(--color-text)' },
                { v: `${weather.todayRainMm} / ~${need.toFixed(1)} mm`, l: t.dashboard.weather.rain, color: rainOk ? RAIN_OK : RAIN_DRY },
                { v: `${weather.windSpeedKmh} km/u`, l: 'Wind', color: 'var(--color-text)' },
              ]
              return cells.map((cell, i) => (
              <div key={i} style={{ padding: '10px 0', textAlign: 'center', borderRight: i < 2 ? '1px solid var(--color-border-soft)' : 'none' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 16, color: cell.color, display: 'block' }}>{cell.v}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-text-muted)' }}>{cell.l}</span>
              </div>
            ))})()}
          </div>
          <div className="weather-forecast" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '12px 8px 14px' }}>
            {weather.forecast.map((day, i) => {
              const d = new Date(day.date)
              const dayLabel = d.toLocaleDateString(t.locale, { weekday: 'short' }).slice(0, 2).toLowerCase()
              return (
                <div key={day.date} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.12em', color: i === 0 ? 'var(--color-overdue)' : 'var(--color-text-muted)', marginBottom: 4 }}>
                    {dayLabel}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 3 }}>
                    <WeatherIcon icon={day.icon} size={18} />
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 12, color: i === 0 ? 'var(--color-overdue)' : 'var(--color-text)', fontWeight: i === 0 ? 500 : 400, lineHeight: 1.1 }}>
                    {day.maxTemp}°
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 400, lineHeight: 1.1 }}>
                    {day.minTemp}°
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function CareTipCard({ fact, t }: { fact: PlantFactOut; t: Translations }) {
  return (
    <div className="card" style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
      <div style={{ padding: '16px 18px 6px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--color-primary)', marginBottom: 4 }}>{t.dashboard.sections.didYouKnow}</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 22, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
          <em style={{ fontStyle: 'italic', fontWeight: 400, color: 'var(--color-primary)' }}>{fact.plant_name}</em>.
        </div>
      </div>
      <div style={{ padding: '10px 18px 18px', borderTop: '1px solid var(--color-border-soft)', marginTop: 8 }}>
        <p style={{
          fontFamily: 'var(--font-heading)', fontStyle: 'italic',
          fontSize: 14, lineHeight: 1.5, color: 'var(--color-text-soft)',
          margin: '0 0 14px', position: 'relative',
        }}>
          <span style={{ color: 'var(--color-overdue)', fontSize: 32, lineHeight: 0, position: 'relative', top: 10, marginRight: 3, fontStyle: 'normal' }}>"</span>
          {fact.fact_nl}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {fact.icon_key && (
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(145deg, #FDFAF1, #EDE5D1)', border: '1px solid var(--color-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img src={`/icons/${fact.icon_key}.svg`} alt="" style={{ width: '78%', height: '78%', objectFit: 'contain' }} />
            </div>
          )}
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 12, color: 'var(--color-text)' }}>{fact.plant_name}</div>
            {fact.species_name && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-text-muted)' }}>{fact.species_name}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function UnderConstructionCard({ icon, title, description, t }: { icon: string; title: string; description: string; t: Translations }) {
  return (
    <div style={{
      borderRadius: 14, overflow: 'hidden', marginBottom: 18,
      border: '1px solid var(--color-border)',
      background: 'repeating-linear-gradient(45deg, var(--color-surface) 0px, var(--color-surface) 8px, var(--color-background) 8px, var(--color-background) 16px)',
      padding: '18px 18px',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--color-text-muted)', marginBottom: 6 }}>
        🚧 {t.dashboard.comingSoon}
      </div>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 18, color: 'var(--color-text)', marginBottom: 4 }}>
        {icon} {title}
      </div>
      <p style={{ margin: 0, fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
        {description}
      </p>
    </div>
  )
}
