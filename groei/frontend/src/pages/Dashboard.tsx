import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useGroeiStore } from '../store/useGroeiStore'
import { CARE_TYPE_INFO } from '../types'
import type { CareTask, RecentLogEntry, MapInfo, PlantFactOut } from '../types'
import type { WeatherData } from '../hooks/useWeather'
import { useWeather } from '../hooks/useWeather'
import UserSwitcher from '../components/UserSwitcher'
import { HALO_COLORS } from '../hooks/usePlantStatus'

const CARE_LABEL_NL: Record<string, string> = {
  water: 'Water',
  fertilize: 'Bemesten',
  mist: 'Sproeien',
  rotate: 'Draaien',
  repot_check: 'Verpotten',
  prune: 'Snoeien',
}

const PX_PER_M = 46

function parseMapDimensions(viewbox: string): { w: number; h: number } | null {
  const parts = viewbox.trim().split(/\s+/).map(Number)
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null
  const [, , wPx, hPx] = parts
  if (wPx <= 0 || hPx <= 0) return null
  return { w: Math.round(wPx / PX_PER_M), h: Math.round(hPx / PX_PER_M) }
}

type DecorIcon = { name: string; left: string; top: string; size: number; rotate: number; opacity: number }

const PAGE_DECOR: DecorIcon[] = [
  { name: 'oak',              left: '68%',  top: '180px',  size: 180, rotate: -8,  opacity: 0.07 },
  { name: 'daisy',            left: '82%',  top: '50px',   size: 50,  rotate: -20, opacity: 0.06 },
  { name: 'crocus',           left: '-2%',  top: '120px',  size: 44,  rotate:   8, opacity: 0.06 },
  { name: 'foxglove',         left: '-2%',  top: '420px',  size: 90,  rotate:  12, opacity: 0.07 },
  { name: 'poppy',            left: '70%',  top: '480px',  size: 65,  rotate:  14, opacity: 0.07 },
  { name: 'peony',            left: '4%',   top: '660px',  size: 80,  rotate:  -8, opacity: 0.07 },
  { name: 'sunflower',        left: '88%',  top: '740px',  size: 100, rotate: -10, opacity: 0.08 },
  { name: 'maple',            left: '74%',  top: '1080px', size: 150, rotate:   8, opacity: 0.06 },
  { name: 'lavender_bare',    left: '-1%',  top: '1140px', size: 70,  rotate:  15, opacity: 0.08 },
  { name: 'silvergrass_bare', left: '78%',  top: '1480px', size: 110, rotate: -12, opacity: 0.06 },
]

function PageDecor() {
  return (
    <div aria-hidden="true" style={{
      position: 'absolute',
      inset: 0,
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: 0,
    }}>
      {PAGE_DECOR.map((d) => (
        <img
          key={d.name}
          src={`/api/icons/${d.name}.svg`}
          alt=""
          style={{
            position: 'absolute',
            left: d.left,
            top: d.top,
            width: d.size,
            height: d.size,
            transform: `rotate(${d.rotate}deg)`,
            opacity: d.opacity,
            userSelect: 'none',
          }}
        />
      ))}
    </div>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return 'Goedenacht'
  if (hour < 12) return 'Goedemorgen'
  if (hour < 18) return 'Goedemiddag'
  return 'Goedenavond'
}

function getDutchDate(): string {
  return new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
}

function leadCopy(overdue: number, due: number): string {
  if (overdue > 0) {
    return `${overdue} ${overdue === 1 ? 'plant vraagt' : 'planten vragen'} je aandacht vandaag.`
  }
  if (due > 0) {
    return `Een paar taken op de planning voor vandaag.`
  }
  return `Een rustige dag in de tuin — binnen en buiten.`
}

function summaryLede(overdue: number, due: number, upcoming: number): string {
  const parts: string[] = []
  if (overdue > 0) parts.push(`${overdue} ${overdue === 1 ? 'taak' : 'taken'} te laat`)
  if (due > 0) parts.push(`${due} vandaag`)
  if (upcoming > 0) parts.push(`${upcoming} op komst`)
  return parts.join(' · ')
}

export default function Dashboard() {
  const { dashboardV2, activeUserId, users, maps, loadDashboardV2, isLoading } = useGroeiStore()
  const activeUser = users.find((u) => u.id === activeUserId)

  const outdoorMap = maps.find((m) => m.map_type === 'outdoor')
  const { weather } = useWeather(outdoorMap?.lat ?? null, outdoorMap?.lon ?? null)

  useEffect(() => {
    loadDashboardV2()
  }, [loadDashboardV2])

  const overdueCount = dashboardV2?.overdue.length ?? 0
  const dueTodayCount = dashboardV2?.due_today.length ?? 0
  const upcomingCount = dashboardV2?.upcoming.length ?? 0
  const totalTasks = overdueCount + dueTodayCount + upcomingCount
  const nextCareTask = dashboardV2?.overdue[0] ?? dashboardV2?.due_today[0] ?? null

  return (
    <div style={{ paddingBottom: 80, position: 'relative', overflow: 'hidden' }}>
      <PageDecor />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Header ── */}
        <DashboardHeader
          greeting={getGreeting()}
          userName={activeUser?.name ?? '…'}
          date={getDutchDate()}
          lede={leadCopy(overdueCount, dueTodayCount)}
          weather={weather}
          nextCareTask={nextCareTask}
        />

        {/* ── Status Banner ── */}
        {dashboardV2 && (
          <StatusBanner counts={dashboardV2.status_counts} />
        )}

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
            <section style={{ padding: '0 24px' }}>
              <SectionHeader
                leftLede={maps.length === 0 ? 'Nog geen tuinen' : maps.length === 1 ? 'Toon je tuin' : `Toon alle ${maps.length} tuinen`}
                rightMarker="§ Mijn Tuinen"
                rightAction={{ to: '/maps', label: 'Beheer →' }}
              />
              {maps.length > 0 ? (
                <div className="no-scrollbar" style={{ display: 'flex', overflowX: 'auto', gap: 14, margin: '0 -24px', padding: '0 24px 8px' }}>
                  {maps.map((map) => <MapCard key={map.id} map={map} />)}
                  <NewMapCard />
                </div>
              ) : (
                <Link to="/maps" style={{
                  display: 'flex', width: '100%', height: 132,
                  border: '1px dashed var(--color-border)', borderRadius: 14,
                  flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-text-muted)', background: 'var(--color-surface)',
                  textDecoration: 'none', marginBottom: 18,
                }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--color-primary)' }}>+</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: 6 }}>Voeg een tuin toe</span>
                </Link>
              )}
            </section>

            {/* Vandaag */}
            <section style={{ padding: '0 24px' }}>
              <SectionHeader
                leftLede={summaryLede(overdueCount, dueTodayCount, upcomingCount)}
                rightMarker="§ Vandaag"
              />
              {isLoading && <TaskSkeletons />}
              {!isLoading && totalTasks === 0 && <CalmEmptyState />}
              {!isLoading && dashboardV2 && totalTasks > 0 && (
                <TodayGrid
                  overdue={dashboardV2.overdue}
                  dueToday={dashboardV2.due_today}
                />
              )}
            </section>

            {/* Logboek */}
            {dashboardV2 && dashboardV2.recent_log.length > 0 && (
              <section style={{ padding: '0 24px' }}>
                <SectionHeader leftLede="" rightMarker="§ Logboek" />
                <LogboekSection entries={dashboardV2.recent_log} />
              </section>
            )}
          </div>

          {/* SIDEBAR column */}
          <div className="dashboard-sidebar" style={{ padding: '0 24px' }}>
            <WeatherCard weather={weather} />
            {dashboardV2?.plant_fact && (
              <CareTipCard fact={dashboardV2.plant_fact} />
            )}
            <UnderConstructionCard
              icon="🌿"
              title="Detectie"
              description="Onkruid & ziektes herkennen — binnenkort beschikbaar."
            />
            <UnderConstructionCard
              icon="📷"
              title="Foto-identificatie"
              description="Richt de camera op een plant — binnenkort beschikbaar."
            />
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
    </div>
  )
}

// ── Helper components ──

function DashboardHeader({
  greeting, userName, date, lede, weather, nextCareTask,
}: {
  greeting: string
  userName: string
  date: string
  lede: string
  weather: WeatherData | null
  nextCareTask: CareTask | null
}) {
  const sunrise = weather ? new Date(weather.sunrise).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '—'
  const sunset  = weather ? new Date(weather.sunset).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '—'
  const temp    = weather ? `${weather.currentTemp}°C` : '—'
  const nextCare = nextCareTask
    ? `${nextCareTask.plant_name}${nextCareTask.days_overdue > 0 ? ` · ${nextCareTask.days_overdue}d te laat` : ' · vandaag'}`
    : 'Alles op schema'

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
            { label: 'Zonsopkomst', value: sunrise },
            { label: 'Zonsondergang', value: sunset },
            { label: 'Buitentemperatuur', value: temp },
            { label: 'Volgende verzorging', value: nextCare },
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

function StatusBanner({ counts }: { counts: { total: number; on_schedule: number; thirsty: number; dry: number } }) {
  const cells = [
    { label: 'Collectie', value: counts.total, color: 'var(--color-text)' },
    { label: 'In schema', value: counts.on_schedule, color: 'var(--color-primary)' },
    { label: 'Dorstig', value: counts.thirsty, color: counts.thirsty > 0 ? 'var(--color-due)' : 'var(--color-text-muted)' },
    { label: 'Droog', value: counts.dry, color: counts.dry > 0 ? 'var(--color-overdue)' : 'var(--color-text-muted)' },
  ]
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
      border: '1px solid var(--color-border)',
      borderLeft: 'none', borderRight: 'none',
      background: 'var(--color-surface)',
      margin: '0 0 4px',
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

function HeroStat({ count, label }: { count: number; label: string }) {
  const isZero = count === 0
  return (
    <div style={{ textAlign: 'right' }}>
      <span style={{
        fontFamily: 'var(--font-heading)',
        fontSize: 34,
        fontWeight: 500,
        lineHeight: 1,
        color: isZero ? 'var(--color-text-muted)' : 'var(--color-primary)',
        display: 'block',
      }}>{count}</span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        textTransform: 'uppercase',
        letterSpacing: '0.15em',
        color: 'var(--color-text-muted)',
        marginTop: 4,
        display: 'block',
      }}>{label}</span>
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

function MapCard({ map }: { map: MapInfo }) {
  const typeLabel = map.map_type === 'outdoor' ? 'Buiten' : 'Binnen'
  const dims = parseMapDimensions(map.viewbox)
  const subLine = dims ? `${typeLabel} · ${dims.w} m × ${dims.h} m` : typeLabel
  return (
    <Link
      to={`/map/${map.slug}`}
      className="card card-glow"
      style={{
        flexShrink: 0,
        width: 260,
        borderRadius: 14,
        overflow: 'hidden',
        textDecoration: 'none',
        color: 'inherit',
        position: 'relative',
      }}
    >
      <div style={{
        aspectRatio: '4 / 3',
        background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)',
        borderBottom: '1px solid var(--color-border-soft)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '14%',
      }}>
        <img
          src={`/api/maps-static/${map.svg_file}`}
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
    </Link>
  )
}

function NewMapCard() {
  return (
    <Link
      to="/maps"
      style={{
        flexShrink: 0,
        width: 260,
        borderRadius: 14,
        border: '1px dashed var(--color-border)',
        background: 'var(--color-surface)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-muted)',
        textDecoration: 'none',
        aspectRatio: '4 / 3',
      }}
    >
      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--color-primary)' }}>+</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: 6 }}>Nieuwe tuin</span>
    </Link>
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
        {tasks.map((t) => <TaskCard key={t.schedule_id} task={t} tone={tone} />)}
      </div>
    </div>
  )
}

function TaskCard({ task, tone }: { task: CareTask; tone: 'overdue' | 'due' | 'upcoming' }) {
  const markCareDone = useGroeiStore((s) => s.markCareDone)
  const careLabel = CARE_LABEL_NL[task.care_type] ?? CARE_TYPE_INFO[task.care_type as keyof typeof CARE_TYPE_INFO]?.label ?? task.care_type

  const accentColor =
    tone === 'overdue' ? 'var(--color-overdue)' :
    tone === 'due' ? 'var(--color-due)' :
    'var(--color-border)'

  const taskHaloColor: string | null =
    task.care_type === 'water' && task.days_overdue > 0  ? HALO_COLORS.dry :
    task.care_type === 'water' && task.days_overdue === 0 ? HALO_COLORS.thirsty :
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
            {task.days_overdue} {task.days_overdue === 1 ? 'dag' : 'dagen'} te laat
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
            over {-task.days_overdue} {-task.days_overdue === 1 ? 'dag' : 'dagen'}
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
          Gedaan
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

function CalmEmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p style={{
        fontFamily: 'var(--font-heading)',
        fontStyle: 'italic',
        fontSize: 18,
        color: 'var(--color-text-soft)',
        margin: '0 0 8px',
      }}>
        Een rustige dag in de tuin.
      </p>
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.2em',
        color: 'var(--color-text-muted)',
        margin: 0,
      }}>
        Geen taken op dit moment
      </p>
    </div>
  )
}

// Stubs — replaced in Tasks 7 and 8
function TodayGrid(_p: { overdue: CareTask[]; dueToday: CareTask[] }) {
  return <p style={{ padding: '20px 24px', fontFamily: 'var(--font-heading)', fontStyle: 'italic', color: 'var(--color-text-muted)' }}>Vandaag laden…</p>
}
function LogboekSection(_p: { entries: RecentLogEntry[] }) { return null }
function WeatherCard(_p: { weather: WeatherData | null }) { return null }
function CareTipCard(_p: { fact: PlantFactOut }) { return null }
function UnderConstructionCard(_p: { icon: string; title: string; description: string }) { return null }
