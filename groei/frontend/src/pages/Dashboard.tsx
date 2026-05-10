import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useGroeiStore } from '../store/useGroeiStore'
import { CARE_TYPE_INFO } from '../types'
import type { CareTask, MapInfo } from '../types'
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
  const { dashboard, activeUserId, users, maps, plantFact, loadDashboard, loadPlantFact, isLoading } = useGroeiStore()
  const activeUser = users.find((u) => u.id === activeUserId)

  useEffect(() => {
    loadDashboard()
    loadPlantFact()
  }, [loadDashboard, loadPlantFact])

  const overdueCount = dashboard?.overdue.length ?? 0
  const dueTodayCount = dashboard?.due_today.length ?? 0
  const upcomingCount = dashboard?.upcoming.length ?? 0
  const totalTasks = overdueCount + dueTodayCount + upcomingCount

  return (
    <div style={{ paddingBottom: 80, position: 'relative', overflow: 'hidden' }}>
      <PageDecor />
      <div style={{ position: 'relative', zIndex: 1 }}>
      {/* ── Hero ── */}
      <header className="home-header" style={{
        padding: '40px 24px 20px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        gap: 20,
      }}>
        <div style={{ flex: 1, minWidth: 240 }}>
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
            {getGreeting()} · {getDutchDate()}
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
            {getGreeting()},{' '}
            <em style={{ fontStyle: 'italic', color: 'var(--color-primary)', fontWeight: 400 }}>
              {activeUser?.name ?? '...'}
            </em>.
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
            {leadCopy(overdueCount, dueTodayCount)}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 16 }}>
          <UserSwitcher />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28 }}>
            <HeroStat count={overdueCount} label="Te laat" />
            <HeroStat count={dueTodayCount} label="Vandaag" />
            <HeroStat count={upcomingCount} label="Op komst" />
          </div>
        </div>
      </header>

      {/* ── Mijn Tuinen ── */}
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
            display: 'flex',
            width: '100%',
            height: 132,
            border: '1px dashed var(--color-border)',
            borderRadius: 14,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-muted)',
            background: 'var(--color-surface)',
            textDecoration: 'none',
            marginBottom: 18,
          }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--color-primary)' }}>+</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: 6 }}>Voeg een tuin toe</span>
          </Link>
        )}
      </section>

      {/* ── Vandaag ── */}
      <section style={{ padding: '0 24px' }}>
        <SectionHeader
          leftLede={summaryLede(overdueCount, dueTodayCount, upcomingCount)}
          rightMarker="§ Vandaag"
        />
        {isLoading && <TaskSkeletons />}
        {!isLoading && totalTasks === 0 && <CalmEmptyState />}
        {!isLoading && dashboard && totalTasks > 0 && (
          <>
            {overdueCount > 0 && <TaskGroup label="Te laat" tone="overdue" tasks={dashboard.overdue} />}
            {dueTodayCount > 0 && <TaskGroup label="Vandaag" tone="due" tasks={dashboard.due_today} />}
            {upcomingCount > 0 && <TaskGroup label="Op komst" tone="upcoming" tasks={dashboard.upcoming} />}
          </>
        )}
      </section>

      {/* ── Wist je dat ── */}
      {plantFact && (
        <section style={{ padding: '0 24px' }}>
          <SectionHeader leftLede="" rightMarker="§ Wist je dat" />
          <article className="card" style={{
            borderRadius: 14,
            padding: '24px 24px 20px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {plantFact.icon_key && (
              <img
                src={`/api/icons/${plantFact.icon_key}.svg`}
                alt=""
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: -12,
                  right: -12,
                  width: 96,
                  height: 96,
                  opacity: 0.18,
                  pointerEvents: 'none',
                }}
              />
            )}
            <p style={{
              fontFamily: 'var(--font-heading)',
              fontStyle: 'italic',
              fontSize: 22,
              color: 'var(--color-primary)',
              lineHeight: 1.1,
              margin: '0 0 12px',
            }}>
              Wist je dat…
            </p>
            <p style={{
              fontFamily: 'var(--font-heading)',
              fontStyle: 'italic',
              fontSize: 15,
              lineHeight: 1.55,
              color: 'var(--color-text-soft)',
              margin: '0 0 18px',
            }}>
              {plantFact.fact_nl}
            </p>
            <div style={{
              paddingTop: 12,
              borderTop: '1px dashed var(--color-border)',
            }}>
              <Link
                to={`/plants/${plantFact.plant_id}`}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--color-primary)',
                  textDecoration: 'none',
                }}
              >
                Meer over {plantFact.plant_name} →
              </Link>
            </div>
          </article>
        </section>
      )}
      </div>
    </div>
  )
}

// ── Helper components ──

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
