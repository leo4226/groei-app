import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { CARE_TYPE_INFO } from '../types'
import type { CareTask, RecentLogEntry, MapInfo, PlantFactOut, WarningSummaryOut, BucketPlantOut } from '../types'
import type { WeatherData } from '../hooks/useWeather'
import { useWeather } from '../hooks/useWeather'
import UserSwitcher from '../components/UserSwitcher'
import { HALO_COLORS } from '../hooks/usePlantStatus'
import { useT } from '../context/LanguageContext'
import { getToken } from '../api/auth'
import type { Translations } from '../i18n/translations'
import PageDecor from '../components/PageDecor'
import WelcomeChecklist from '../components/WelcomeChecklist'
import WeatherCard from '../components/dashboard/WeatherCard'
import TodayGrid from '../components/dashboard/TodayGrid'
import NewMapModal from '../components/dashboard/NewMapModal'

const PX_PER_M = 46

function parseMapDimensions(viewbox: string): { w: number; h: number } | null {
  const parts = viewbox.trim().split(/\s+/).map(Number)
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null
  const [, , wPx, hPx] = parts
  if (wPx <= 0 || hPx <= 0) return null
  return { w: Math.round(wPx / PX_PER_M), h: Math.round(hPx / PX_PER_M) }
}

export default function Dashboard() {
  const { dashboardV2, activeUserId, users, maps, plants, loadDashboardV2, loadPlants, loadWarningSummary, warningSummary, isLoading } = useFloreren()
  const activeUser = users.find((u) => u.id === activeUserId)
  const t = useT()

  const [showNewMap, setShowNewMap] = useState(false)

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
    if (getToken()) { loadDashboardV2(); loadPlants(); loadWarningSummary() }
  }, [loadDashboardV2, loadPlants, loadWarningSummary])

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
          onCreateMap={() => setShowNewMap(true)}
        />

        {/* ── Responsive grid: main + sidebar ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }} className="dashboard-grid">
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
                  <NewMapCard t={t} onNewMap={() => setShowNewMap(true)} />
                </div>
              ) : (
                <button onClick={() => setShowNewMap(true)} style={{
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

            {warningSummary && (
              <CareWarningsSection summary={warningSummary} plants={plants} t={t} />
            )}

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
                  upcoming={dashboardV2.upcoming}
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
            <div className="identify-cards-row">
              <Link to="/weeds/identify" style={{ textDecoration: 'none', display: 'block' }}>
                <div className="identify-card" style={{
                  height: '100%', borderRadius: 14, overflow: 'hidden',
                  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                  padding: '14px 14px', cursor: 'pointer', transition: 'border-color 0.15s', boxSizing: 'border-box',
                }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16, color: 'var(--color-text)', marginBottom: 4 }}>
                    🌿 {t.weeds.identifyCard.title}
                  </div>
                  <p style={{ margin: 0, fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                    {t.weeds.identifyCard.subtitle}
                  </p>
                </div>
              </Link>
              <Link to="/identify" style={{ textDecoration: 'none', display: 'block' }}>
                <div className="identify-card" style={{
                  height: '100%', borderRadius: 14, overflow: 'hidden',
                  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                  padding: '14px 14px', cursor: 'pointer', transition: 'border-color 0.15s', boxSizing: 'border-box',
                }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16, color: 'var(--color-text)', marginBottom: 4 }}>
                    {t.identify.card.title}
                  </div>
                  <p style={{ margin: 0, fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                    {t.identify.card.subtitle}
                  </p>
                </div>
              </Link>
            </div>
          </div>
        </div>

      </div>

      <style>{`
        .identify-cards-row {
          display: grid; grid-template-columns: 1fr; gap: 10px;
          margin-bottom: 18px; width: calc(100% + 48px);
          margin-left: -24px; padding: 0 24px; box-sizing: border-box;
        }
        @media (min-width: 721px) {
          .identify-cards-row { grid-template-columns: 1fr 1fr; width: 100%; margin-left: 0; padding: 0; }
        }
        @media (min-width: 900px) {
          .identify-cards-row > a { margin-bottom: 18px; }
          .identify-card { padding: 18px 18px !important; }
          .identify-cards-row { grid-template-columns: 1fr; width: 100%; margin-left: 0; padding: 0; }
          .dashboard-grid { grid-template-columns: 1fr 340px !important; align-items: start; padding: 0 24px; gap: 28px; }
          .dashboard-sidebar { padding: 0 !important; }
        }
        .weather-card-header { padding: 16px 18px 6px; }
        .weather-card-header .condition-text { font-size: 16px; }
        .weather-stats { display: grid; grid-template-columns: 1fr 1fr 1fr; border-top: 1px solid var(--color-border-soft); border-bottom: 1px solid var(--color-border-soft); }
        .weather-stats-cell { padding: 10px 4px; text-align: center; min-width: 0; overflow: hidden; }
        .weather-stats-cell:not(:last-child) { border-right: 1px solid var(--color-border-soft); }
        .weather-stats-value { font-family: var(--font-heading); font-size: 16px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .weather-stats-label { font-family: var(--font-mono); font-size: 8px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--color-text-muted); }
        .weather-forecast { display: grid; grid-template-columns: repeat(7, 1fr); padding: 12px 8px 14px; }
        @media (max-width: 480px) {
          .weather-card-header { padding: 12px 14px 4px !important; }
          .weather-card-header .condition-text { font-size: 14px !important; }
          .weather-stats { grid-template-columns: 1fr 1fr !important; }
          .weather-stats-cell:nth-child(3) { display: none !important; }
          .weather-stats-value { font-size: 12px !important; }
          .weather-forecast { padding: 8px 4px 10px !important; }
        }
      `}</style>

      <NewMapModal open={showNewMap} onClose={() => setShowNewMap(false)} />
    </div>
  )
}

// ── Helper components ──

function DashboardHeader({
  t, greeting, userName, date, lede, weather, nextCareTask,
}: {
  t: Translations; greeting: string; userName: string; date: string; lede: string
  weather: WeatherData | null; nextCareTask: CareTask | null
}) {
  const sunrise = weather ? new Date(weather.sunrise).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' }) : '—'
  const sunset  = weather ? new Date(weather.sunset).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' }) : '—'
  const temp    = weather ? `${weather.currentTemp}°C` : '—'
  const nextCare = nextCareTask
    ? `${nextCareTask.plant_name}${nextCareTask.days_overdue > 0 ? ` · ${t.dashboard.tasks.daysLate(nextCareTask.days_overdue)}` : ` · ${t.dashboard.tasks.today}`}`
    : t.dashboard.almanac.onTrack

  return (
    <header className="dashboard-header" style={{
      padding: '40px 24px 20px', borderBottom: '1px solid var(--color-border)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20,
    }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-text-muted)', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 24, height: 1, background: 'var(--color-border)', flex: 'none' }} />
          {greeting} · {date}
          <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        </p>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 'clamp(36px, 5vw, 56px)', lineHeight: 0.95, letterSpacing: '-0.02em', color: 'var(--color-text)', margin: 0 }}>
          {greeting},{' '}
          <em style={{ fontStyle: 'italic', color: 'var(--color-primary)', fontWeight: 400 }}>{userName}</em>.
        </h1>
        <p className="dashboard-lede" style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 15, lineHeight: 1.5, color: 'var(--color-text-soft)', maxWidth: 440, margin: '8px 0 16px 0' }}>
          {lede}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden', maxWidth: 440 }}>
          {[
            { label: t.dashboard.almanac.sunrise, value: sunrise },
            { label: t.dashboard.almanac.sunset, value: sunset },
            { label: t.dashboard.almanac.temp, value: temp },
            { label: t.dashboard.almanac.nextCare, value: nextCare },
          ].map((row, i) => (
            <div key={row.label} style={{ padding: '10px 14px', borderRight: i % 2 === 0 ? '1px solid var(--color-border)' : 'none', borderBottom: i < 2 ? '1px solid var(--color-border)' : 'none', background: 'var(--color-surface)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-text-muted)', marginBottom: 3 }}>{row.label}</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 14, color: i === 2 ? 'var(--color-overdue)' : 'var(--color-text)', fontWeight: 500 }}>{row.value}</div>
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
    <div className="status-banner" style={{ display: 'grid', gridTemplateColumns: `repeat(${cells.length}, 1fr)`, border: '1px solid var(--color-border)', borderLeft: 'none', borderRight: 'none', background: 'var(--color-surface)', margin: '0 0 20px' }}>
      {cells.map((cell, i) => (
        <div key={cell.label} style={{ padding: '12px 16px 18px', textAlign: 'center', borderRight: i < cells.length - 1 ? '1px solid var(--color-border-soft)' : 'none' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-text-muted)', marginBottom: 5 }}>{cell.label}</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 500, lineHeight: 1, color: cell.color }}>{cell.value}</div>
        </div>
      ))}
    </div>
  )
}

function CareWarningsSection({ summary, plants, t }: { summary: WarningSummaryOut; plants: { id: number; icon_key: string | null }[]; t: Translations }) {
  const hasIssues = summary.total_plants - summary.on_schedule > 0

  if (!hasIssues) {
    return (
      <section style={{ padding: '0 24px' }}>
        <SectionHeader leftLede="" rightMarker={t.dashboard.sections.careSignals} />
        <div style={{ textAlign: 'center', padding: '20px 0 36px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 14 }}>
          {t.dashboard.warnings.allOnSchedule}
        </div>
      </section>
    )
  }

  const totalWarnings = summary.kpis.reduce((s, k) => s + k.count, 0)

  return (
    <section style={{ padding: '0 24px' }}>
      <SectionHeader leftLede={t.dashboard.warnings.signalCount(totalWarnings)} rightMarker={t.dashboard.sections.careSignals} />
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
        {summary.kpis.map(kpi => (
          <span key={kpi.care_type} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '4px 9px', borderRadius: 20, background: kpi.urgent_count > 0 ? 'rgba(200,60,60,.08)' : 'rgba(47,93,58,.06)', border: `1px solid ${kpi.urgent_count > 0 ? 'rgba(200,60,60,.2)' : 'rgba(47,93,58,.12)'}`, fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <span>{kpi.icon}</span>
            <span>{kpi.label_nl}</span>
            <span style={{ fontWeight: 600, marginLeft: 2 }}>{kpi.count}</span>
            {kpi.urgent_count > 0 && <span style={{ color: 'var(--color-overdue)', marginLeft: 1 }}>!{kpi.urgent_count}</span>}
          </span>
        ))}
      </div>
      <WarningBucket label={t.dashboard.warnings.bucketNow} icon="🔴" plants={summary.buckets.nu} plantsLookup={plants} t={t} />
      <WarningBucket label={t.dashboard.warnings.bucketToday} icon="🟡" plants={summary.buckets.vandaag} plantsLookup={plants} t={t} />
      <WarningBucket label={t.dashboard.warnings.bucketThisWeek} icon="🟢" plants={summary.buckets.komende_week} plantsLookup={plants} t={t} noBorder />
    </section>
  )
}

function WarningBucket({ label, icon, plants, plantsLookup, t, noBorder }: { label: string; icon: string; plants: BucketPlantOut[]; plantsLookup: { id: number; icon_key: string | null }[]; t: Translations; noBorder?: boolean }) {
  if (plants.length === 0) return null
  return (
    <div style={{ marginBottom: noBorder ? 0 : 10, marginTop: noBorder ? 0 : 10 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-text-muted)', marginBottom: 6 }}>
        {icon} {label} · {t.dashboard.warnings.plantCount(plants.length)}
      </div>
      <div style={{ border: '1px solid var(--color-border-soft)', borderRadius: 10, overflow: 'hidden' }}>
        {plants.map((plant, i) => {
          const iconKey = plantsLookup.find(p => p.id === plant.plant_id)?.icon_key ?? plant.plant_icon_variant
          const careInfo = plant.care_type ? CARE_TYPE_INFO[plant.care_type as keyof typeof CARE_TYPE_INFO] : null
          return (
            <Link key={plant.plant_id} to={`/plants/${plant.plant_id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit', padding: '10px 12px', borderBottom: i < plants.length - 1 ? '1px solid var(--color-border-soft)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(145deg, #FDFAF1, #F4EEDB)', border: '1px solid var(--color-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                  {iconKey ? <img src={`/icons/${iconKey}.svg`} alt="" style={{ width: '70%', height: '70%', objectFit: 'contain' }} /> : <span style={{ fontSize: 16 }}>🌱</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plant.plant_name}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                    {careInfo && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 99, fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', background: plant.top_warning?.severity === 'urgent' ? 'rgba(200,60,60,.08)' : 'rgba(47,93,58,.06)', border: `1px solid ${plant.top_warning?.severity === 'urgent' ? 'rgba(200,60,60,.2)' : 'rgba(47,93,58,.12)'}`, color: plant.top_warning?.severity === 'urgent' ? 'var(--color-overdue)' : 'var(--color-primary)' }}>
                        {careInfo.icon} {t.care[plant.care_type as keyof typeof t.care] ?? plant.care_type}{plant.days_overdue != null && plant.days_overdue > 0 ? ` +${plant.days_overdue}` : ''}
                      </span>
                    )}
                    {plant.top_warning?.message_nl && !['schedule_overdue', 'schedule_due_today', 'seasonal'].includes(plant.top_warning.trigger) && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 99, fontFamily: 'var(--font-mono)', fontSize: 9, background: 'rgba(250,200,50,.1)', border: '1px solid rgba(250,200,50,.25)', color: 'var(--color-text)', whiteSpace: 'nowrap' as const }}>
                        {plant.top_warning.icon} {plant.top_warning.message_nl}
                      </span>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>→</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function SectionHeader({ leftLede, rightMarker, rightAction }: { leftLede: string; rightMarker: string; rightAction?: { to: string; label: string } }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '20px 0 18px', borderBottom: '1px solid var(--color-border)', marginBottom: 18, gap: 12 }}>
      <p style={{ margin: 0, fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 15, color: 'var(--color-text-soft)', flex: 1, minWidth: 0 }}>{leftLede}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--color-text-muted)' }}>{rightMarker}</span>
        {rightAction && <Link to={rightAction.to} style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-primary)', textDecoration: 'none' }}>{rightAction.label}</Link>}
      </div>
    </div>
  )
}

function MapCard({ map, t }: { map: MapInfo; t: Translations }) {
  const typeLabel = map.map_type === 'outdoor' ? t.dashboard.actions.mapTypeOutdoor : t.dashboard.actions.mapTypeIndoor
  const dims = parseMapDimensions(map.viewbox)
  const subLine = dims ? `${typeLabel} · ${dims.w} m × ${dims.h} m` : typeLabel
  const [imgLoaded, setImgLoaded] = useState(false)
  return (
    <div className="card dash-map-card" style={{ flexShrink: 0, width: 300, borderRadius: 14, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <Link to={`/map/${map.slug}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit', position: 'relative' }}>
        <div style={{ aspectRatio: '4 / 3', background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: map.thumbnail_file ? '6%' : '14%', position: 'relative' }}>
          {!imgLoaded && (
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
              <div className="skeleton" style={{ width: '60%', height: '60%', borderRadius: 10 }} />
            </div>
          )}
          <img src={map.thumbnail_file ?? map.svg_file ?? ''} alt={map.name} onLoad={() => setImgLoaded(true)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <span style={{ position: 'absolute', top: 8, left: 8, fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', background: 'rgba(251,247,238,0.92)', padding: '2px 7px', borderRadius: 5, border: '1px solid var(--color-border-soft)' }}>
          {typeLabel}
        </span>
      </Link>
      <div style={{ padding: '12px 14px 10px', borderTop: '1px solid var(--color-border-soft)' }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16, lineHeight: 1.15, color: 'var(--color-text)', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{map.name}</h3>
        <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 12, color: 'var(--color-text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subLine}</p>
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid var(--color-border-soft)', marginTop: 'auto' }}>
        <Link to={`/map/${map.slug}`} style={{ flex: 1, textAlign: 'center', padding: '9px 0', fontFamily: 'var(--font-heading)', fontSize: 12, fontWeight: 500, color: 'var(--color-primary)', textDecoration: 'none', borderRight: '1px solid var(--color-border-soft)' }}>{t.dashboard.actions.view}</Link>
        <Link to={`/maps/${map.id}/edit-layout`} style={{ flex: 1, textAlign: 'center', padding: '9px 0', fontFamily: 'var(--font-heading)', fontSize: 12, fontWeight: 500, color: 'var(--color-text-soft)', textDecoration: 'none', borderRight: '1px solid var(--color-border-soft)' }}>{t.dashboard.actions.edit}</Link>
        <Link to={`/maps/${map.id}/settings`} title={t.mapSettings.pageTitle} style={{ padding: '9px 14px', fontFamily: 'var(--font-heading)', fontSize: 12, fontWeight: 500, color: 'var(--color-text-soft)', textDecoration: 'none' }}>⚙</Link>
      </div>
    </div>
  )
}

function NewMapCard({ t, onNewMap }: { t: Translations; onNewMap: () => void }) {
  return (
    <button onClick={onNewMap} style={{ flexShrink: 0, width: 300, borderRadius: 14, border: '1px dashed var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', cursor: 'pointer', aspectRatio: '4 / 3' }}>
      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--color-primary)' }}>+</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: 6 }}>{t.dashboard.actions.newGarden}</span>
    </button>
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
      <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 18, color: 'var(--color-text-soft)', margin: '0 0 8px' }}>{t.dashboard.tasks.calm}</p>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--color-text-muted)', margin: 0 }}>{t.dashboard.tasks.noTasks}</p>
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
          <div key={entry.id} className="log-entry" style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto', gap: 14, padding: '16px 18px', alignItems: 'flex-start', borderTop: i > 0 ? '1px solid var(--color-border-soft)' : 'none' }}>
            <div style={{ width: 56, height: 56, borderRadius: 8, background: 'linear-gradient(145deg, #FDFAF1, #EDE5D1)', border: '1px solid var(--color-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {entry.icon_key ? <img src={`/icons/${entry.icon_key}.svg`} alt="" style={{ width: '80%', height: '80%', objectFit: 'contain' }} /> : <span style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 11, color: 'var(--color-text-muted)' }}>🌿</span>}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-text-muted)', marginBottom: 3 }}>{dateStr} · {timeStr}</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, color: 'var(--color-text)', marginBottom: 2 }}>{actionLabel} · <em style={{ color: 'var(--color-primary)' }}>{entry.plant_name}</em></div>
              {entry.notes && <p style={{ margin: 0, fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 12, color: 'var(--color-text-soft)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{entry.notes}</p>}
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: tag.color, background: tag.bg, padding: '3px 8px', borderRadius: 99, border: `1px solid ${tag.border}`, whiteSpace: 'nowrap', flexShrink: 0 }}>{actionLabel}</span>
          </div>
        )
      })}
      <div style={{ borderTop: '1px solid var(--color-border-soft)', padding: '12px 18px', display: 'flex', justifyContent: 'flex-end' }}>
        <Link to="/plants" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-primary)', textDecoration: 'none' }}>{t.dashboard.actions.fullLog}</Link>
      </div>
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
        <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 14, lineHeight: 1.5, color: 'var(--color-text-soft)', margin: '0 0 14px', position: 'relative' }}>
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
            {fact.species_name && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-text-muted)' }}>{fact.species_name}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
