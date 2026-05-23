import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useFloreren } from '../../store/useFloreren'
import { CARE_TYPE_INFO } from '../../types'
import type { CareTask } from '../../types'
import { HALO_COLORS } from '../../hooks/usePlantStatus'
import { useT } from '../../context/LanguageContext'
import type { Translations } from '../../i18n/translations'
import { resolveIconUrl } from '../../utils/icons'

function classifyTaskLocation(task: CareTask): 'buiten' | 'binnen' {
  if (task.location === 'Tuin') return 'buiten'
  if (task.location === 'Huis') return 'binnen'
  if (task.map_type === 'outdoor') return 'buiten'
  if (task.map_type === 'indoor') return 'binnen'
  return 'buiten'
}

const LOCATION_ICON = {
  buiten: '🌿',
  binnen: '🏠',
} as const

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
  const plants = useFloreren(s => s.plants)
  const iconKey = plants.find(p => p.id === task.plant_id)?.icon_key ?? null
  const careLabel = t.care[task.care_type as keyof typeof t.care] ?? task.care_type
  const isOverdue = task.days_overdue > 0

  const taskHaloColor: string | null =
    task.care_type === 'water' && task.days_overdue >= 0 ? HALO_COLORS.needs_care : null

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '44px 1fr auto',
      gap: 10, alignItems: 'center',
      padding: '12px 14px',
      borderBottom: '1px dashed var(--color-border-soft)',
    }}>
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
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)', border: '1px solid var(--color-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {iconKey && <img src={resolveIconUrl(iconKey)!} alt="" style={{ width: '78%', height: '78%', objectFit: 'contain' }} />}
          </div>
        )}
      </div>

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

function GroupedTaskRow({ tasks, t }: { tasks: CareTask[]; t: Translations }) {
  const markCareDone = useFloreren(s => s.markCareDone)
  const plants = useFloreren(s => s.plants)
  const plant = tasks[0]
  const iconKey = plants.find(p => p.id === plant.plant_id)?.icon_key ?? null
  const allOverdue = tasks.some(task => task.days_overdue > 0)
  const maxOverdue = Math.max(...tasks.map(t => t.days_overdue))

  const hasWaterHalo = tasks.some(t => t.care_type === 'water' && t.days_overdue >= 0)

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '44px 1fr',
      gap: 10, alignItems: 'start',
      padding: '12px 14px',
      borderBottom: '1px dashed var(--color-border-soft)',
    }}>
      <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
        {hasWaterHalo && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 10,
            background: `radial-gradient(circle, ${HALO_COLORS.needs_care} 0%, transparent 70%)`,
            opacity: 0.5, pointerEvents: 'none',
          }} />
        )}
        {plant.plant_photo ? (
          <img src={plant.plant_photo} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', display: 'block', position: 'relative' }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)', border: '1px solid var(--color-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {iconKey && <img src={resolveIconUrl(iconKey)!} alt="" style={{ width: '78%', height: '78%', objectFit: 'contain' }} />}
          </div>
        )}
      </div>

      <Link to={`/plants/${plant.plant_id}`} style={{ minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
        <p style={{
          margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 14,
          color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{plant.plant_name}</p>
        {allOverdue ? (
          <p style={{ margin: '2px 0 4px', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 11, color: 'var(--color-overdue)' }}>
            {t.dashboard.tasks.daysLate(maxOverdue)}
          </p>
        ) : (
          <p style={{ margin: '2px 0 4px', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 11, color: 'var(--color-due)' }}>
            {t.dashboard.tasks.today}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {tasks.map((task) => {
            const careIcon = CARE_TYPE_INFO[task.care_type as keyof typeof CARE_TYPE_INFO]?.icon ?? '·'
            const careLabel = t.care[task.care_type as keyof typeof t.care] ?? task.care_type
            const overdue = task.days_overdue > 0
            const badgeBg = overdue ? 'rgba(200,60,60,.1)' : 'rgba(47,93,58,.08)'
            const badgeColor = overdue ? 'var(--color-overdue)' : 'var(--color-primary)'
            const badgeBorder = overdue ? 'rgba(200,60,60,.2)' : 'rgba(47,93,58,.2)'
            return (
              <span key={task.care_type} style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '2px 8px', borderRadius: 99,
                fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase',
                letterSpacing: '0.1em',
                background: badgeBg, color: badgeColor,
                border: `1px solid ${badgeBorder}`,
              }}>
                {careIcon} {careLabel}
                {overdue && <span style={{ fontWeight: 600 }}> +{task.days_overdue}</span>}
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); markCareDone(task.plant_id, task.care_type) }}
                  style={{
                    fontFamily: 'var(--font-body)', fontSize: 8, fontWeight: 600,
                    color: badgeColor, border: 'none', borderRadius: 100,
                    background: 'transparent', padding: '0 0 0 3px',
                    cursor: 'pointer', lineHeight: 1, opacity: 0.6,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.6' }}
                  title={`Markeer ${careLabel} als gedaan`}
                >✓</button>
              </span>
            )
          })}
        </div>
      </Link>
    </div>
  )
}

function LocationGroup({
  label, icon, tasks, tone, t,
}: {
  label: string; icon: string; tasks: CareTask[]; tone: 'overdue' | 'due' | 'upcoming'; t: Translations
}) {
  const [open, setOpen] = useState(tasks.length > 0)

  const grouped = tasks.reduce<Map<number, CareTask[]>>((acc, task) => {
    const existing = acc.get(task.plant_id)
    if (existing) { existing.push(task) }
    else { acc.set(task.plant_id, [task]) }
    return acc
  }, new Map())
  const entries = Array.from(grouped.entries())

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', padding: '8px 14px',
          border: 'none', borderBottom: '1px solid var(--color-border-soft)',
          background: 'var(--color-surface)',
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 15, width: 22, textAlign: 'center' }}>{icon}</span>
        <span style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-soft)', flex: 1, textAlign: 'left' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-text-muted)' }}>{tasks.length}</span>
        <span style={{ fontSize: 9, color: 'var(--color-text-muted)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
      </button>
      {open && (
        grouped.size === 0 ? (
          <div style={{ padding: '14px 16px', textAlign: 'center' }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 12, color: 'var(--color-text-muted)' }}>{t.dashboard.almanac.onTrack}</span>
          </div>
        ) : (
          entries.map(([plantId, plantTasks]) =>
            plantTasks.length === 1
              ? <TodayTaskRow key={plantId} task={plantTasks[0]} t={t} />
              : <GroupedTaskRow key={plantId} tasks={plantTasks} t={t} />
          )
        )
      )}
    </div>
  )
}

export default function TodayGrid({ overdue, dueToday, upcoming, t }: { overdue: CareTask[]; dueToday: CareTask[]; upcoming: CareTask[]; t: Translations }) {
  const allDue = [...overdue, ...dueToday, ...upcoming]
  const waterFeedTypes = new Set(['water', 'fertilize'])
  const waterFeedTasks = allDue.filter(task => waterFeedTypes.has(task.care_type))
  const attnTasks = allDue.filter(task => !waterFeedTypes.has(task.care_type))

  function groupByLocation(tasks: CareTask[]) {
    return {
      buiten: tasks.filter(task => classifyTaskLocation(task) === 'buiten'),
      binnen: tasks.filter(task => classifyTaskLocation(task) === 'binnen'),
    }
  }

  const waterFeedGroups = groupByLocation(waterFeedTasks)
  const attnGroups = groupByLocation(attnTasks)

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      border: '1px solid var(--color-border)', borderRadius: 14,
      overflow: 'hidden', marginBottom: 24,
    }}>
      <TodayColHead label={t.dashboard.tasks.waterFeed} count={waterFeedTasks.length} pip="overdue" />
      <TodayColHead label={t.dashboard.tasks.attention} count={attnTasks.length} pip="due" borderLeft />

      <div style={{ borderRight: '1px solid var(--color-border-soft)' }}>
        {waterFeedTasks.length === 0 ? <EmptyCol t={t} /> : (
          <>
            <LocationGroup label={t.dashboard.actions.mapTypeOutdoor} icon={LOCATION_ICON.buiten} tasks={waterFeedGroups.buiten} tone="due" t={t} />
            <LocationGroup label={t.dashboard.actions.mapTypeIndoor} icon={LOCATION_ICON.binnen} tasks={waterFeedGroups.binnen} tone="due" t={t} />
          </>
        )}
      </div>

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
