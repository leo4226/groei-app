import { useState, useEffect } from 'react'
import MonthView from './MonthView'
import PhenologyView from './PhenologyView'
import { useT } from '../../context/LanguageContext'
import { useIsNarrow } from './useIsNarrow'
import Glyph, { type GlyphName } from '../../components/ui/Glyph'
import './calendar.css'

const GROUP_OUTDOOR_KEY = 'floreren-group-outdoor-warnings'
const GROUP_OUTDOOR_EVENT = 'floreren-group-outdoor-changed'

export type CalendarViewMode = 'month' | 'agenda'

function EnvironmentFilter({
  env,
  onChange,
  className,
}: {
  env: string
  onChange(env: string): void
  className?: string
}) {
  const t = useT()

  return (
    <div className={`calendar-environment-filter ${className ?? ''}`}>
      {([
        { id: 'all', label: t.common.all, desc: t.calendar.filterDescAll, glyph: 'list' as GlyphName },
        { id: 'tuin', label: t.common.garden, desc: t.calendar.filterDescGarden, glyph: 'leaf' as GlyphName },
        { id: 'huis', label: t.common.house, desc: t.calendar.filterDescHouse, glyph: 'home' as GlyphName },
      ] as const).map(({ id, label, desc, glyph }) => {
        const active = env === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              gap: 2, cursor: 'pointer', textAlign: 'left',
              padding: '10px 18px', borderRadius: 14,
              border: `1.5px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
              background: active ? 'var(--color-primary)' : 'var(--color-surface)',
              color: active ? 'var(--color-surface)' : 'var(--color-text)',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Glyph name={glyph} size={15} /> {label}
            </span>
            <span style={{
              fontSize: 11, lineHeight: 1.3, fontWeight: 400,
              color: active ? 'var(--color-surface)' : 'var(--color-text-muted)',
              opacity: active ? 0.85 : 1,
            }}>
              {desc}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function StandaloneToggle({ view, onSet }: { view: CalendarViewMode; onSet(v: CalendarViewMode): void }) {
  const t = useT()
  return (
    <div className="standalone-toggle-container" style={{
      width: 'min(100%, 1800px)', margin: '0 auto', padding: 'max(clamp(16px, 4vw, 48px), env(safe-area-inset-top, 0px)) clamp(24px, 3vw, 56px) 0',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div className="view-toggle">
        <button className={view === 'month' ? 'on' : ''} onClick={() => onSet('month')}>{t.calendar.month}</button>
        <button className={view === 'agenda' ? 'on' : ''} onClick={() => onSet('agenda')}>{t.calendar.agenda}</button>
      </div>
    </div>
  )
}

export default function PlanningCalendarPage() {
  const isNarrow = useIsNarrow()
  const [view, setView] = useState<CalendarViewMode>(isNarrow ? 'agenda' : 'month')
  const [env, setEnv] = useState('all')
  const [groupOutdoor, setGroupOutdoor] = useState(() => localStorage.getItem(GROUP_OUTDOOR_KEY) !== 'false')

  useEffect(() => {
    const handler = () => setGroupOutdoor(localStorage.getItem(GROUP_OUTDOOR_KEY) !== 'false')
    window.addEventListener(GROUP_OUTDOOR_EVENT, handler)
    return () => window.removeEventListener(GROUP_OUTDOOR_EVENT, handler)
  }, [])

  return (
    <div className="cal-page">
      {view === 'month' ? (
        <MonthView
          viewMode={view}
          onSetView={setView}
          env={env}
          groupOutdoor={groupOutdoor}
          environmentFilter={<EnvironmentFilter env={env} onChange={setEnv} />}
        />
      ) : (
        <>
          <StandaloneToggle view={view} onSet={setView} />
          <PhenologyView />
        </>
      )}
    </div>
  )
}
